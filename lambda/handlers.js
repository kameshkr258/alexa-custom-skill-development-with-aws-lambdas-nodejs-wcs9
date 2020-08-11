const Alexa = require("ask-sdk-core");
const axios = require("axios");
const https = require("https");

const storeId = "11";
const hostname = "184.170.233.64";
const portSearch = "30901";

const callApiHandler = {
  consume(url, method, headers, data) {
      
    console.log(`url: ${url}, method: ${method}, data: ${JSON.stringify(data)}`);
    return axios({
      url: url,
      method: method,
      headers: headers,
      data: data,
      responseType: "json",
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    })
      .then((response) => {
        console.log(`success callApiHandler ${url} : `, response.data);
        return response;
      })
      .catch((error) => {
        console.log(`error callApiHandler ${url} : `, error.response.data);
        return error;
      });
  },
};

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "LaunchRequest"
    );
  },
  async handle(handlerInput) {
    let speechText = handlerInput.t("WELCOME_MSG", { name: "smith" });

    let response;

    await callApiHandler
      .consume(
        `https://${hostname}:${portSearch}/search/resources/store/${storeId}/categoryview/@top`,
        "GET",
        { "Content-Type": "application/json" }
      )
      .then((resp) => {
        response = resp;
      });

    speechText += handlerInput.t("CATEGORY_MSG", {
      records: response.data.recordSetCount,
    });

    var counter = 0;
    response.data.catalogGroupView.forEach((obj) => {
      speechText += handlerInput.t("CATEGORY_NAME_MSG", {
        counter: ++counter,
        categoryName: obj.name,
      });
    });

    console.log("success", speechText);

    return handlerInput.responseBuilder
      .speak(speechText)
      .addDelegateDirective({
        name: "CategoryIntent"
      })
      .getResponse();
  },
};

const CategoryIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "CategoryIntent"
    );
  },
  async handle(handlerInput) {
    const { requestEnvelope } = handlerInput;
    const { intent } = requestEnvelope.request;
    var categoryName;
    var categoryId;
    var response;

    console.log("intent.confirmationStatus : ", intent.confirmationStatus);
    console.log("requestEnvelope : ", requestEnvelope, "intent : ", intent);
    if (intent.confirmationStatus === "CONFIRMED") {
      const categoryNameSlot = Alexa.getSlot(requestEnvelope, "categoryName");
      categoryName = categoryNameSlot.value;
      categoryId =
        categoryNameSlot.resolutions.resolutionsPerAuthority[0].values[0].value
          .id; //MM
      let speechText = "";

      await callApiHandler
        .consume(
          `https://${hostname}:${portSearch}/search/resources/store/${storeId}/productview/byCategory/${categoryId}`,
          "GET",
          { "Content-Type": "application/json" }
        )
        .then((resp) => {
          response = resp;
        });

      speechText += handlerInput.t("PRODUCT_MSG", {
        records: response.data.recordSetTotal,
        categoryName: categoryName,
      });

      var counter = 0;
      response.data.catalogEntryView.forEach((obj) => {
        speechText += handlerInput.t("PRODUCT_NAME_MSG", {
          counter: ++counter,
          productName: obj.name,
        });
      });

      return handlerInput.responseBuilder
        .speak(speechText)
        .addDelegateDirective({
          name: "ProductIntent",
        })
        .getResponse();
    }
    let speechText = handlerInput.t("REJECTED_MSG");

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .getResponse();
  },
};

const ProductIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "ProductIntent"
    );
  },
  async handle(handlerInput) {
    const { attributesManager, requestEnvelope } = handlerInput;
    const sessionAttributes = attributesManager.getSessionAttributes();

    const { intent } = requestEnvelope.request;
    var productName;
    var productSku;
    var quantity;
    var response;

    console.log("intent.confirmationStatus : ", intent.confirmationStatus);
    console.log("requestEnvelope : ", requestEnvelope, "intent : ", intent);
    if (intent.confirmationStatus === "CONFIRMED") {
      const productNameSlot = Alexa.getSlot(requestEnvelope, "productName");
      productName = productNameSlot.value;
      productSku =
        productNameSlot.resolutions.resolutionsPerAuthority[0].values[0].value
          .id; //MM
      quantity = Alexa.getSlotValue(requestEnvelope, "quantity");

      await callApiHandler
        .consume(
          `https://${hostname}:${portSearch}/search/resources/store/${storeId}/productview/${productSku}`,
          "GET",
          { "Content-Type": "application/json" }
        )
        .then((resp) => {
          response = resp;
        });

      var itemId = response.data.catalogEntryView[0].sKUs[0].uniqueID;
      var shortDescription = response.data.catalogEntryView[0].shortDescription;
      var offerPrice =
        Math.round(response.data.catalogEntryView[0].price[1].value * 100) /
        100;

      sessionAttributes["itemId"] = itemId;
      sessionAttributes["quantity"] = quantity;

      let speechText = handlerInput.t("PRODUCT_DETAIL_MSG", {
        description: shortDescription,
        price: offerPrice,
      });

      speechText += handlerInput.t("ADD_TO_CART_MSG", {
        quantity: quantity,
        productName: productName,
      });

      return handlerInput.responseBuilder.speak(speechText).getResponse();
    }
    let speechText = handlerInput.t("REJECTED_MSG");

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .getResponse();
  },
};

const AddToCartIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "AddToCartIntent"
    );
  },
  async handle(handlerInput) {
    const { attributesManager, requestEnvelope } = handlerInput;
    const sessionAttributes = attributesManager.getSessionAttributes();
    const { intent } = requestEnvelope.request;

    var response;
    const itemId = sessionAttributes["itemId"];
    const quantity = sessionAttributes["quantity"];

    await callApiHandler
      .consume(
        `https://${hostname}/wcs/resources/store/${storeId}/guestidentity`,
        "POST",
        { "Content-Type": "application/json" }
      )
      .then((response) => {
        sessionAttributes["WCTrustedToken"] = response.data.WCTrustedToken;
        sessionAttributes["WCToken"] = response.data.WCToken;
      });

    const headers = {
      "Content-Type": "application/json",
      WCTrustedToken: sessionAttributes["WCTrustedToken"],
      WCToken: sessionAttributes["WCToken"]
    };

    var data = {
      x_inventoryValidation: "true",
      orderId: ".",
      orderItem: [
        {
          quantity: quantity,
          productId: itemId,
        },
      ],
      x_calculateOrder: "1",
    };

    await callApiHandler
      .consume(
        `https://${hostname}/wcs/resources/store/${storeId}/cart`,
        "POST",
        headers,
        data
      )
      .then((resp) => {
        response = resp;
      });

    sessionAttributes["orderId"] = response.data.orderId;

    await callApiHandler
      .consume(
        `https://${hostname}/wcs/resources/store/${storeId}/cart/@self`,
        "GET",
        headers
      )
      .then((resp) => {
        response = resp;
      });

    var totalProductPrice =
      Math.round(response.data.totalProductPrice * 100) / 100;
    var promotionCode = response.data.orderItem[0].adjustment[0].code;
    sessionAttributes["piAmount"] = response.data.grandTotal;
      
    let speechText = handlerInput.t("PRODUCT_ADDED_TO_CART_MSG", {
      price: totalProductPrice,
      offer: promotionCode,
    });

    return handlerInput.responseBuilder.speak(speechText).getResponse();
  },
};

const PlaceOrderIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "PlaceOrderIntent"
    );
  },
  async handle(handlerInput) {
    const { attributesManager, requestEnvelope } = handlerInput;
    const sessionAttributes = attributesManager.getSessionAttributes();
    const { intent } = requestEnvelope.request;

    console.log("intent.confirmationStatus : ", intent.confirmationStatus);
    console.log("requestEnvelope : ", requestEnvelope, "intent : ", intent);

    var response;
    const orderId = sessionAttributes["orderId"];
    const addressNickName = Alexa.getSlotValue(requestEnvelope, "nickName");
    const piAmount = sessionAttributes["piAmount"];

    const headers = {
      "Content-Type": "application/json",
      WCTrustedToken: sessionAttributes["WCTrustedToken"],
      WCToken: sessionAttributes["WCToken"],
    };

    var data = {
      country: "Canada",
      state: "Ontario",
      addressLine: ["123 Street St", ""],
      nickName: addressNickName,
      email1: "test@test.com",
      firstName: "John",
      lastName: "Smith",
      zipCode: "L6G1C7",
      city: "Markham",
      phone1: "123-123-123",
      addressType: "ShippingAndBilling"
    };

    await callApiHandler
      .consume(
        `https://${hostname}/wcs/resources/store/${storeId}/person/@self/contact`,
        "POST",
        headers,
        data
      )
      .then((resp) => {
        response = resp;
      });

    const addressId = response.data.addressId;

    data = {
      x_calculationUsage: "-1,-2,-3,-4,-5,-6,-7",
      orderId: ".",
      addressId: addressId,
      x_calculateOrder: "1",
      x_allocate: "***",
      x_backorder: "***",
      x_remerge: "***",
      x_check: "*n"
    };
    await callApiHandler
      .consume(
        `https://${hostname}/wcs/resources/store/${storeId}/cart/@self/shipping_info`,
        "PUT",
        headers,
        data
      )
      .then((resp) => {
        response = resp;
      });

    data = {
      orderId: orderId,
      piAmount: piAmount,
      billing_address_id: addressId,
      payMethodId: "COD"
    };
    await callApiHandler
      .consume(
        `https://${hostname}/wcs/resources/store/${storeId}/cart/@self/payment_instruction`,
        "POST",
        headers,
        data
      )
      .then((resp) => {
        response = resp;
      });
    data = { orderId: "." };
    await callApiHandler
      .consume(
        `https://${hostname}/wcs/resources/store/${storeId}/cart/@self/precheckout`,
        "PUT",
        headers,
        data
      )
      .then((resp) => {
        response = resp;
      });

    await callApiHandler
      .consume(
        `https://${hostname}/wcs/resources/store/${storeId}/cart/@self/checkout`,
        "POST",
        headers,
        data
      )
      .then((resp) => {
        response = resp;
      });

    let speechText = handlerInput.t("ORDER_PLACE_MSG", {
      piAmount: Math.round(piAmount * 100) / 100,
      orderId: orderId
    });
    return handlerInput.responseBuilder
      .speak(speechText)
      .addDelegateDirective({
        name: "ThankyouMsgIntent",
      })
      .getResponse();
  },
};

const ThankyouMsgIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "ThankyouMsgIntent"
    );
  },
  handle(handlerInput) {
    const speechText = handlerInput.t("THANKYOU_MSG");

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .getResponse();
  },
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.HelpIntent"
    );
  },
  handle(handlerInput) {
    const speechText = handlerInput.t("HELP_MSG");

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .getResponse();
  },
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      (Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "AMAZON.CancelIntent" ||
        Alexa.getIntentName(handlerInput.requestEnvelope) ===
          "AMAZON.StopIntent")
    );
  },
  handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const name = sessionAttributes["name"] || "";
    const speechText = handlerInput.t("GOODBYE_MSG", { name: name });

    return handlerInput.responseBuilder.speak(speechText).getResponse();
  },
};
/* *
 * FallbackIntent triggers when a customer says something that doesn’t map to any intents in your skill
 * It must also be defined in the language model (if the locale supports it)
 * This handler can be safely added but will be ingnored in locales that do not support it yet
 * */
const FallbackIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "AMAZON.FallbackIntent"
    );
  },
  handle(handlerInput) {
    const speechText = handlerInput.t("FALLBACK_MSG");

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(handlerInput.t("REPROMPT_MSG"))
      .getResponse();
  },
};
/* *
 * SessionEndedRequest notifies that a session was ended. This handler will be triggered when a currently open
 * session is closed for one of the following reasons: 1) The user says "exit" or "quit". 2) The user does not
 * respond or says something that does not match an intent defined in your voice model. 3) An error occurs
 * */
const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
      "SessionEndedRequest"
    );
  },
  handle(handlerInput) {
    console.log(
      `~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`
    );

    return handlerInput.responseBuilder.getResponse(); // notice we send an empty response
  },
};
/* *
 * The intent reflector is used for interaction model testing and debugging.
 * It will simply repeat the intent the user said. You can create custom handlers for your intents
 * by defining them above, then also adding them to the request handler chain below
 * */
const IntentReflectorHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest"
    );
  },
  handle(handlerInput) {
    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
    const speechText = handlerInput.t("REFLECTOR_MSG", { intent: intentName });

    return (
      handlerInput.responseBuilder
        .speak(speechText)
        //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
        .getResponse()
    );
  },
};
/**
 * Generic error handling to capture any syntax or routing errors. If you receive an error
 * stating the request handler chain is not found, you have not implemented a handler for
 * the intent being invoked or included it in the skill builder below
 * */
const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    const speechText = handlerInput.t("ERROR_MSG");
    console.log(`~~~~ Error handled: `, handlerInput.requestEnvelope);

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(handlerInput.t("REPROMPT_MSG"))
      .getResponse();
  },
};

module.exports = {
  LaunchRequestHandler,
  PlaceOrderIntentHandler,
  CategoryIntentHandler,
  ProductIntentHandler,
  ThankyouMsgIntentHandler,
  AddToCartIntentHandler,
  HelpIntentHandler,
  CancelAndStopIntentHandler,
  FallbackIntentHandler,
  SessionEndedRequestHandler,
  IntentReflectorHandler,
  ErrorHandler,
};
