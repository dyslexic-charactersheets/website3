// Translators login
import crypto from 'crypto';
import moment from 'moment';

const dateFormat = 'YYYY-MM';

var auth;

var loginTokens = [];
var timedTokenBase;
var timedTokens = [];
var date = '';

function updateTimedTokens() {
    var d = moment().format(dateFormat);
    if (date != d) {
        date = d;
        tt = [];

        for (var i = 2; i >= 0; i--) {
            d = moment().subtract(i, "months").format(dateFormat);
            
            var hash = crypto.createHash('sha256');
            hash.update(timedTokenBase);
            hash.update(d);
            var token = hash.digest('hex').substring(0, 32);

            // console.log(`[token]         Timed token (${i}):`, token);
            tt.push(token);
        }
        timedTokens = tt;
    }
}

export function setupTokenAuth(conf, a) {
    auth = a;

    loginTokens = conf('login_tokens');
    loginTokens.forEach(token => {
        var url = conf('url')+'auth/token-login?token='+token;
        console.log("[token]         Token login URL:        ", url);
    });
    // console.log("[token]         Tokens:", loginTokens);

    timedTokenBase = conf('timed_token_base');
    updateTimedTokens();
    var url = conf('url')+'auth/token-login?token='+timedTokens[2];
    console.log("[token]         Timed token login URL:  ", url);
}

export function getTimedLoginToken() {
    updateTimedTokens();
}

export function tokenLogin(req, res) {
    console.log("[token]         Login");
    try {
        var token = req.query.token;
        console.log("[token]         Token =", token);

        // static tokens
        if (loginTokens.indexOf(token) != -1) {
            console.log("[token]         Login now");
            auth.setLogin(res, true);
            return;
        }

        // timed tokens
        updateTimedTokens();
        if (timedTokens.indexOf(token) != -1) {
            console.log("[token]         Login now");
            auth.setLogin(res, true);
            return;
        }

        // Nope.
        auth.failLogin(res, true);
    } catch (e) {
        console.log("[token]         Error:", e);
        auth.failLogin(res, true);
    }
}
