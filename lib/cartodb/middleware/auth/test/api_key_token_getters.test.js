
'use strict';

const getApiKeyTokenFromRequest = require('../lib/get_api_key_token_from_request.js');
const apiKeyTokenGetterMiddleware = require('../get_api_key_token')();
const assert = require('../../../../../test/support/assert');

const DEFAULT_API_KEY_ID = 'default-public'; //TODO config

const EXAMPLE_APIKEY_USERNAME = 'username';
const EXAMPLE_APIKEY_TOKEN = 'exampleAPIkeyToken';

function createReq(...input) {
  return Object.assign({}, {
    query: {},
    headers: {},
  }, ...input);
}

function createRes() {
  const res = {
    locals: {
      user: EXAMPLE_APIKEY_USERNAME,
      auth: {},
    },
  };

  return res;
}

describe('API key getters', () => {
  
  describe('Get API key from', () => {
    
    it('Authorization header', () => {
      const headers = {
        headers: {
          authorization: 'Basic ' + Buffer
            .from(`${EXAMPLE_APIKEY_USERNAME}:${EXAMPLE_APIKEY_TOKEN}`)
            .toString('base64')
        }
      };
      const req = createReq(headers);

      const {username, apiKeyToken} = getApiKeyTokenFromRequest(req);

      assert.equal(username, EXAMPLE_APIKEY_USERNAME);
      assert.equal(apiKeyToken, EXAMPLE_APIKEY_TOKEN);
    });

    it('Query parameter', () => {
      const queryStringParams = {
        query: {
          api_key: EXAMPLE_APIKEY_TOKEN
        }
      };
      const req = createReq(queryStringParams);

      const {username, apiKeyToken} = getApiKeyTokenFromRequest(req);

      assert(username === null);
      assert.equal(apiKeyToken, EXAMPLE_APIKEY_TOKEN);
    });

    it('Body parameter', () => {
      const body = {
        body: {
          api_key: EXAMPLE_APIKEY_TOKEN
        }
      };
      const req = createReq(body);

      const {username, apiKeyToken} = getApiKeyTokenFromRequest(req);

      assert(username === null);
      assert.equal(apiKeyToken, EXAMPLE_APIKEY_TOKEN);
    });
  });

  describe('Order of preference', () => {
    
    it('Authorization header has max priority', () => {
      const headers = {
        headers: {
          authorization: 'Basic ' + Buffer
            .from(`${EXAMPLE_APIKEY_USERNAME}:${EXAMPLE_APIKEY_TOKEN}-header`)
            .toString('base64')
        }
      };
      const queryStringParams = {
        query: {
          api_key: EXAMPLE_APIKEY_TOKEN
        }
      };
      const body = {
        body: {
          api_key: EXAMPLE_APIKEY_TOKEN
        }
      };
      const req = createReq(headers, queryStringParams, body);

      const {apiKeyToken} = getApiKeyTokenFromRequest(req);

      assert.equal(apiKeyToken, EXAMPLE_APIKEY_TOKEN + '-header');
    });

    it('Query params over Body', () => {
      const queryStringParams = {
        query: {
          api_key: EXAMPLE_APIKEY_TOKEN + '-query'
        }
      };
      const body = {
        body: {
          api_key: EXAMPLE_APIKEY_TOKEN
        }
      };
      const req = createReq(queryStringParams, body);

      const {apiKeyToken} = getApiKeyTokenFromRequest(req);

      assert.equal(apiKeyToken, EXAMPLE_APIKEY_TOKEN + '-query');
    });
  });

  describe('Misc', () => {
    
    it('Use default API key if none provided', (next) => {
      const req = createReq();
      const res = createRes();

      apiKeyTokenGetterMiddleware(req, res, (err) => {
        assert.ifError(err);
        assert.equal(res.locals.auth.apiKeyToken, DEFAULT_API_KEY_ID);
        next();
      });
    });
    
  });

});