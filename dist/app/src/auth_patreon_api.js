// Patreon login
import url from 'url';
import patreon from 'patreon';
// import { response } from 'express';

let auth;
let patreonCampaignID;
let patreonOAuthClient;

let loginURL = "";
let redirectURL = "";

function getCurrentUser(api) {
    return new Promise((resolve, reject) => {
        api('/current_user')
            .then(({store}) => {
                var users = store.findAll('user');
                if (users.length == 0) {
                    resolve(null);
                    return;
                }
                resolve(users[0]);
            })
            .catch((err) => {
                resolve(null);
            });
    });
}

function getCurrentPledge(api) {
    let fields = 'fields[memberships]=status,currently_entitled_amount_cents';
    let url = `/current_user?include=memberships.null&${encodeURIComponent(fields)}`;
    return new Promise((resolve, reject) => {
        api(url)
            .then(({store}) => {
                var pledges = store.findAll('pledge');
                resolve((pledges.length >= 0) ? pledges[0] : null);
            })
            .catch((err) => {
                resolve(null);
            });
    });
}

function getCampaignPledges(api) {
    return new Promise((resolve, reject) => {
        api(`/campaigns/${patreonCampaignID}/members`)
            .then(({store}) => {
                var pledges = store.findAll('pledge');
                resolve(pledges);
            })
            .catch((err) => {
                reject(err);
            });
    });
}

function getAPI(oauthGrantCode) {
    return new Promise((resolve, reject) => {
        patreonOAuthClient.getTokens(oauthGrantCode, patreonRedirectURL)
            .then((tokensResponse) => {
                var api = patreon.patreon(tokensResponse.access_token);
                resolve(api);
            })
            .catch((err) => {
                reject(err);
            });
    });
}

export function patreonLoginURL() {
  return loginURL;
}

export function patreonRedirectURL() {
  return redirectURL;
}
    
export function setupPatreonAuth (conf, a) {
  auth = a;
  patreonCampaignID = conf('patreon_v1_campaign_id');
  var client_id = conf('patreon_v1_client_id');
  var client_secret = conf('patreon_v1_client_secret');
  // var creator_access_token = conf('patreon_v1_creator_access_token');
  
  patreonOAuthClient = patreon.oauth(client_id, client_secret);
  // console.log("[patreon]       Patreon OAuth Client", patreonOAuthClient);
  
  redirectURL = conf('url')+'auth/patreon-redirect';
  loginURL = `https://www.patreon.com/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(client_id)}&redirect_uri=${encodeURIComponent(patreonRedirectURL)}`;
}

export function patreonRedirect (req, res) {
  var oauthGrantCode = url.parse(req.url, true).query.code;

  getAPI(oauthGrantCode).then((api) => {
    getCurrentPledge(api).then((pledge) => {
      console.log("[patreon]       Pledge:", pledge);
      if (pledge === null) {
        auth.failLogin(res, true);
        return;
      }
      
      var pledgeValue = pledge.amount_cents;
      if (pledgeValue === null || pledgeValue == 0) {
        auth.failLogin(res, true);
        return;
      }
      auth.setLogin(res, true);
    }).catch((err) => {
      console.error('[patreon]       Error!', err);
      auth.failLogin(res, true);
    });

  }).catch((err) => {
    console.error('[patreon]       Error!', err);
    auth.failLogin(res, true);
  });
}

