const axios = require('axios');
const firebase = require('firebase-admin');

// Initialize Firebase
const serviceAccount = require('./etsy-tester-firebase-adminsdk-t0dht-97483d74ec.json');
firebase.initializeApp({
  credential: firebase.credential.cert(serviceAccount),
});
const db = firebase.firestore();

const SHIPSTATION_API_KEY = '6a0f3770a9764ab8b1cefc061e7855b8';
const SHIPSTATION_API_SECRET = '4b04c923b2e84c52a1624e045a82051d';

async function processOrder() {
  console.log("Starting order processing...");

  const snapshot = await db.collection('processedOrders').get();
  console.log(`Fetched ${snapshot.docs.length} orders from Firestore.`);

  for (const order of snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))) {
    console.log(`Processing order with Firestore ID: ${order.id}`);

    const ssOrderId = order.apiResponse?.orderNumber;
    if (!ssOrderId) {
      console.error(`Missing ShipStation Order ID in order ${order.id}`);
      continue;
    }

    try {
      const ssOrderRes = await getShippingDetails(ssOrderId);
      if (ssOrderRes.status !== 200) {
        console.error(`Error fetching ShipStation order ${ssOrderId}: Status ${ssOrderRes.status}, Message: ${ssOrderRes.statusText}`);
        continue;
      }

      const ssOrder = ssOrderRes.data;
      const orderStatus = ssOrder.orderStatus;
      console.log(`Order status for ${ssOrderId} is ${orderStatus}`);

      const trackingNumbers = orderStatus === 'shipped' ? await getShippedOrderTrackingNumbers(ssOrder) : null;

      await db.collection('processedOrders').doc(order.id).update({
        orderStatus,
        ...(trackingNumbers && { trackingNumbers }),
      });
      console.log(`Updated Firestore order ${order.id} with ${trackingNumbers ? 'tracking numbers' : 'status only'}.`);
    } catch (error) {
      console.error(`Error processing order ${order.id}: ${error.message}`, {
        error: error?.response?.data || error.message,
        orderId: ssOrderId,
        orderFirestoreId: order.id,
        endpoint: error.config?.url,
        method: error.config?.method
      });
    }
  }
}

async function getShippingDetails(orderId) {
  const requestUrl = `https://ssapi7.shipstation.com/orders/${orderId}`;
  const headers = {
    'Authorization': 'Basic ' + Buffer.from(SHIPSTATION_API_KEY + ':' + SHIPSTATION_API_SECRET).toString('base64'),
    'Content-Type': 'application/json',
  };

  console.log(`Fetching ShipStation order details for order ID: ${orderId}`);

  try {
    const response = await axios.get(requestUrl, { headers });
    console.log(`Successfully fetched details for ShipStation order ID: ${orderId}`);
    return { status: response.status, data: response.data };
  } catch (error) {
    console.error(`Axios error fetching ShipStation order ID ${orderId}: ${error.message}`, {
      endpoint: requestUrl,
      status: error.response?.status,
      errorData: error.response?.data
    });
    throw error;
  }
}

async function getShippedOrderTrackingNumbers(ssOrder) {
  const fulfillmentsRes = await ssFulfillmentsGet(ssOrder.orderId);
  if (fulfillmentsRes.status === 200) {
    const fulfillments = fulfillmentsRes.data.fulfillments || [];
    console.log(`Found ${fulfillments.length} fulfillments for order ID: ${ssOrder.orderId}`);
    return fulfillments.map(f => f.trackingNumber);
  } else {
    console.error(`Could not get fulfillment data for order ID: ${ssOrder.orderId}, Status: ${fulfillmentsRes.status}`);
    return null;
  }
}

async function ssFulfillmentsGet(orderId) {
  const requestUrl = `https://ssapi7.shipstation.com/fulfillments?orderId=${orderId}`;
  const headers = {
    'Authorization': 'Basic ' + Buffer.from(SHIPSTATION_API_KEY + ':' + SHIPSTATION_API_SECRET).toString('base64'),
    'Content-Type': 'application/json',
  };

  console.log(`Fetching ShipStation fulfillments for order ID: ${orderId}`);

  try {
    const response = await axios.get(requestUrl, { headers });
    console.log(`Successfully fetched ShipStation fulfillments for order ID: ${orderId}`);
    return { status: response.status, data: response.data };
  } catch (error) {
    console.error(`Axios error fetching ShipStation fulfillments for order ID ${orderId}: ${error.message}`, {
      endpoint: requestUrl,
      status: error.response?.status,
      errorData: error.response?.data
    });
    throw error;
  }
}

// Call the function to start processing orders
processOrder();
