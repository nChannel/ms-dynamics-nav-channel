'use strict'

let GetCustomerFromQuery = function (ncUtil, channelProfile, flowContext, payload, callback) {

  log("Building response object...", ncUtil);
  let out = {
    ncStatusCode: null,
    response: {},
    payload: {}
  };

  let invalid = false;
  let invalidMsg = "";

  if (!ncUtil) {
    invalid = true;
    invalidMsg = "ncUtil was not provided"
  }

  // Sanity Checking
  if (!channelProfile) {
    invalid = true;
    invalidMsg = "channelProfile was not provided"
  } else if (!channelProfile.channelSettingsValues) {
    invalid = true;
    invalidMsg = "channelProfile.channelSettingsValues was not provided"
  } else if (!channelProfile.channelSettingsValues.protocol) {
    invalid = true;
    invalidMsg = "channelProfile.channelSettingsValues.protocol was not provided"
  } else if (!channelProfile.channelAuthValues) {
    invalid = true;
    invalidMsg = "channelProfile.channelAuthValues was not provided"
  } else if (!channelProfile.channelAuthValues.username) {
    invalid = true;
    invalidMsg = "channelProfile.channelAuthValues.username was not provided"
  } else if (!channelProfile.channelAuthValues.password) {
    invalid = true;
    invalidMsg = "channelProfile.channelAuthValues.password was not provided"
  } else if (!channelProfile.channelAuthValues.customerUrl) {
    invalid = true;
    invalidMsg = "channelProfile.channelAuthValues.customerUrl was not provided"
  } else if (!channelProfile.customerBusinessReferences) {
    invalid = true;
    invalidMsg = "channelProfile.customerBusinessReferences was not provided"
  } else if (!Array.isArray(channelProfile.customerBusinessReferences)) {
    invalid = true;
    invalidMsg = "channelProfile.customerBusinessReferences is not an array"
  } else if (channelProfile.customerBusinessReferences.length === 0) {
    invalid = true;
    invalidMsg = "channelProfile.customerBusinessReferences is empty"
  }

  // Payload Checking
  if (!payload) {
    invalid = true;
    invalidMsg = "payload was not provided"
  } else if (!payload.doc) {
    invalid = true;
    invalidMsg = "payload.doc was not provided";
  } else if (!payload.doc.remoteIDs && !payload.doc.searchFields && !payload.doc.modifiedDateRange) {
    invalid = true;
    invalidMsg = "either payload.doc.remoteIDs or payload.doc.searchFields or payload.doc.modifiedDateRange must be provided"
  } else if (payload.doc.remoteIDs && (payload.doc.searchFields || payload.doc.modifiedDateRange)) {
    invalid = true;
    invalidMsg = "only one of payload.doc.remoteIDs or payload.doc.searchFields or payload.doc.modifiedDateRange may be provided"
  } else if (payload.doc.remoteIDs && (!Array.isArray(payload.doc.remoteIDs) || payload.doc.remoteIDs.length === 0)) {
    invalid = true;
    invalidMsg = "payload.doc.remoteIDs must be an Array with at least 1 remoteID"
  } else if (payload.doc.searchFields && (!Array.isArray(payload.doc.searchFields) || payload.doc.searchFields.length === 0)) {
    invalid = true;
    invalidMsg = "payload.doc.searchFields must be an Array with at least 1 key value pair: {searchField: 'key', searchValues: ['value_1']}"
  } else if (payload.doc.searchFields) {
    for (let i = 0; i < payload.doc.searchFields.length; i++) {
      if (!payload.doc.searchFields[i].searchField || !Array.isArray(payload.doc.searchFields[i].searchValues) || payload.doc.searchFields[i].searchValues.length === 0) {
        invalid = true;
        invalidMsg = "payload.doc.searchFields[" + i + "] must be a key value pair: {searchField: 'key', searchValues: ['value_1']}";
        break;
      }
    }
  } else if (payload.doc.modifiedDateRange && !(payload.doc.modifiedDateRange.startDateGMT || payload.doc.modifiedDateRange.endDateGMT)) {
    invalid = true;
    invalidMsg = "at least one of payload.doc.modifiedDateRange.startDateGMT or payload.doc.modifiedDateRange.endDateGMT must be provided"
  } else if (payload.doc.modifiedDateRange && payload.doc.modifiedDateRange.startDateGMT && payload.doc.modifiedDateRange.endDateGMT && (payload.doc.modifiedDateRange.startDateGMT > payload.doc.modifiedDateRange.endDateGMT)) {
    invalid = true;
    invalidMsg = "startDateGMT must have a date before endDateGMT";
  }

  // Callback Checking
  if (!callback) {
    throw new Error("A callback function was not provided");
  } else if (typeof callback !== 'function') {
    throw new TypeError("callback is not a function")
  }

  if (!invalid) {

    // Require SOAP
    const soap = require('strong-soap/src/soap');
    const NTLMSecurity = require('strong-soap').NTLMSecurity;
    const nc = require('../util/common');

    // Setup Request Arguments
    let args = {
      filter: []
    };

    if (payload.doc.searchFields) {

      payload.doc.searchFields.forEach(function (searchField) {
        let obj = {};
        obj["Field"] = searchField.searchField;
        obj["Criteria"] = searchField.searchValues.join('|'); // The pipe '|' symbol is a NAV filter for 'OR'
        args.filter.push(obj);
      });

    } else if (payload.doc.remoteIDs) {

      let obj = {};
      obj["Field"] = "No";
      obj["Criteria"] = payload.doc.remoteIDs.join('|'); // The pipe '|' symbol is a NAV filter for 'OR'
      args.filter.push(obj);

    } else if (payload.doc.modifiedDateRange) {

      let obj = {};
      obj["Field"] = "Last_Date_Modified";

      if (payload.doc.modifiedDateRange.startDateGMT && !payload.doc.modifiedDateRange.endDateGMT) {
        // '..' is a NAV filter for interval. Using as a suffix pulls records after the startDate
        obj["Criteria"] = nc.formatDate(new Date(Date.parse(payload.doc.modifiedDateRange.startDateGMT) - 1).toISOString()) + "..";
      } else if (payload.doc.modifiedDateRange.endDateGMT && !payload.doc.modifiedDateRange.startDateGMT) {
        // '..' is a NAV filter for interval. Using as a prefix pulls records before the endDate
        obj["Criteria"] = ".." + nc.formatDate(new Date(Date.parse(payload.doc.modifiedDateRange.endDateGMT) + 1).toISOString());
      } else if (payload.doc.modifiedDateRange.startDateGMT && payload.doc.modifiedDateRange.endDateGMT) {
        // '..' is a NAV filter for interval. Using between two dates as part of the string pulls records between startDate and endDate
        obj["Criteria"] = nc.formatDate(new Date(Date.parse(payload.doc.modifiedDateRange.startDateGMT) - 1).toISOString()) + ".." + nc.formatDate(new Date(Date.parse(payload.doc.modifiedDateRange.endDateGMT) + 1).toISOString());
      }

      args.filter.push(obj);
    }

    // Paging Context
    if (payload.doc.pagingContext) {
      args.bookmarkKey = payload.doc.pagingContext.key;
    }

    // Page Size
    if (payload.doc.pageSize) {
      args.setSize = payload.doc.pageSize;
    }

    // https://<baseUrl>:<port>/<serverInstance>/WS/<companyName>/Page/Customer
    let username = channelProfile.channelAuthValues.username;
    let password = channelProfile.channelAuthValues.password;
    let domain = channelProfile.channelAuthValues.domain;
    let workstation = channelProfile.channelAuthValues.workstation;
    let url = channelProfile.channelAuthValues.customerUrl;
    let customerServiceName = channelProfile.channelAuthValues.customerServiceName;

    let wsdlAuthRequired = true;
    let ntlmSecurity = new NTLMSecurity(username, password, domain, workstation, wsdlAuthRequired);

    // Log Service Names
    log(`Customer Service Name: ${customerServiceName}`);

    // Log URL
    log("Using URL [" + url + "]", ncUtil);

    let options = {
      NTLMSecurity: ntlmSecurity
    };

    let pagingContext = {};

    try {
      soap.createClient(url, options, function(err, client) {
        if (!err) {
          client.ReadMultiple(args, function(error, body, envelope, soapHeader) {

            let docs = [];
            let data = body;

            if (!error) {
              if (!body.ReadMultiple_Result) {
                // If ReadMultiple_Result is undefined, no results were returned
                out.ncStatusCode = 204;
                out.payload = data;
                callback(out);
              } else {
                if (Array.isArray(body.ReadMultiple_Result[customerServiceName])) {
                  // If an array is returned, multiple customers were found
                  for (let i = 0; i < body.ReadMultiple_Result[customerServiceName].length; i++) {
                    let customer = {
                      Customer: body.ReadMultiple_Result[customerServiceName][i]
                    };
                    docs.push({
                      doc: customer,
                      customerRemoteID: customer.Customer.No,
                      customerBusinessReference: nc.extractBusinessReference(channelProfile.customerBusinessReferences, customer)
                    });

                    if (i == body.ReadMultiple_Result[customerServiceName].length - 1) {
                      pagingContext.key = body.ReadMultiple_Result[customerServiceName][i].Key;
                    }
                  }
                } else if (typeof body.ReadMultiple_Result[customerServiceName] === 'object') {
                  // If an object is returned, one customer was found
                  let customer = {
                    Customer: body.ReadMultiple_Result[customerServiceName]
                  };
                  docs.push({
                    doc: customer,
                    customerRemoteID: customer.Customer.No,
                    customerBusinessReference: nc.extractBusinessReference(channelProfile.customerBusinessReferences, customer)
                  });

                  pagingContext.key = body.ReadMultiple_Result[customerServiceName].Key;
                }

                if (docs.length === payload.doc.pageSize) {
                  out.ncStatusCode = 206;
                  out.pagingContext = pagingContext;
                } else {
                  out.ncStatusCode = 200;
                }
                out.payload = docs;
                callback(out);
              }
            } else {
              if (error.response) {
                logError("Error - Returning Response as 400 - " + error, ncUtil);
                out.ncStatusCode = 400;
                out.payload.error = error;
                callback(out);
              } else {
                logError("GetCustomerFromQuery Callback error - " + error, ncUtil);
                out.ncStatusCode = 500;
                out.payload.error = error;
                callback(out);
              }
            }
          });
        } else {
          let errStr = String(err);

          if (errStr.indexOf("Code: 401") !== -1) {
            logError("401 Unauthorized (Invalid Credentials) " + errStr);
            out.ncStatusCode = 400;
            out.response.endpointStatusCode = 401;
            out.response.endpointStatusMessage = "Unauthorized";
            out.payload.error = err;
          } else {
            logError("GetCustomerFromQuery Callback error - " + err, ncUtil);
            out.ncStatusCode = 500;
            out.payload.error = err;
          }
          callback(out);
        }
      });
    } catch (err) {
      // Exception Handling
      logError("Exception occurred in GetCustomerFromQuery - " + err, ncUtil);
      out.ncStatusCode = 500;
      out.payload.error = err;
      callback(out);
    }
  } else {
    // Invalid Request
    log("Callback with an invalid request - " + invalidMsg, ncUtil);
    out.ncStatusCode = 400;
    out.payload.error = invalidMsg;
    callback(out);
  }
};

function logError(msg, ncUtil) {
  console.log("[error] " + msg);
}

function log(msg, ncUtil) {
  console.log("[info] " + msg);
}

module.exports.GetCustomerFromQuery = GetCustomerFromQuery;
