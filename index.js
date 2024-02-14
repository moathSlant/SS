const axios = require('axios');
const firebase = require('firebase-admin');

// Initialize Firebase
const serviceAccount = require('./etsy-tester-firebase-adminsdk-t0dht-97483d74ec.json');
firebase.initializeApp({
  credential: firebase.credential.cert(serviceAccount),
});
const db = firebase.firestore();

const shipstationConfig = {
  authentication: {
    apiKey: '6a0f3770a9764ab8b1cefc061e7855b8',
    apiSecret: '4b04c923b2e84c52a1624e045a82051d',
  },

};

async function processOrder() {
  const snapshot = await db.collection('processedOrders').get();
  const orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  for (const order of orders) {
    try {
      const apiResponseOrderId = order.apiResponseOrderId;
      if (!apiResponseOrderId) {
        console.error(`Missing apiResponseOrderId in order ${order.id}`);
        continue;
      }

      const orderRef = await db.collection('processedOrders').doc(order.id).get();
      if (!orderRef.exists) {
        console.error(`Order ${order.id} does not exist`);
        continue;
      }

      const orderData = orderRef.data();
      const ssOrderRes = await getShippingDetails(apiResponseOrderId);

      if (ssOrderRes.status === 404) {
        console.debug(`Order ${apiResponseOrderId} not found`);
        continue;
      }

      if (ssOrderRes.status !== 200) {
        console.error(`Error fetching order ${apiResponseOrderId}: ${ssOrderRes.statusText}`);
        continue;
      }

      const ssOrder = ssOrderRes.data;
      const orderStatus = ssOrder.orderStatus;

      const trackingNumbers =
        orderStatus === 'shipped'
          ? await getShippedOrderTrackingNumbers(ssOrder)
          : null;

      if (trackingNumbers !== null) {
        await db.collection('processedOrders').doc(order.id).update({
          orderStatus,
          trackingNumbers,
        });
      } else {
        await db.collection('processedOrders').doc(order.id).update({
          orderStatus,
        });
      }
    } catch (error) {
      console.error(`Error processing order ${order.id}:`, error);
    }
  }
}


async function getShippingDetails(orderId) {
  const requestUrl = `https://ssapi.shipstation.com/orders/${orderId}`;
  const requestHeaders = {
    'Content-Type': 'application/json',
    'ShipStation-Api-Key': shipstationConfig.authentication.apiKey,
    'ShipStation-Api-Secret': shipstationConfig.authentication.apiSecret,
  };

  try {
    const response = await axios.get(requestUrl, { headers: requestHeaders });

    if (response.status !== 200) {
      throw new Error(`Error fetching order ${orderId}: ${response.statusText}`);
    }

    return response.data;
  } catch (error) {
    throw new Error(`Error fetching order ${orderId}: ${error}`);
  }
}

async function getShippedOrderTrackingNumbers(ssOrder) {
}

setInterval(processOrder, 60000); // Process orders every minute