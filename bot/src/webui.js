const DiscordStrat = require('passport-discord').Strategy;
const passport = require('passport');
const renderer = require('vue-server-renderer').createRenderer();
const server = require('express')();
const session = require('express-session');
const Vue = require('vue');

const scopes = ['identify', 'guilds'];
const prompt = 'consent';

class WebUI {

    constructor(vixen) {
        this.vixen = vixen;

        this.run();
    }

    async run() {
        passport.serializeUser(function(user, done) {
            done(null, user);
        });

        passport.deserializeUser(function(obj, done) {
            done(null, obj);
        });

        // const statement = this.vixen.db.prepare('SELECT * FROM vixen WHERE ID=?');
        // const clientId = statement.get('clientid').value;
        // const secret = statement.get('secret').value;
        const vixenVars = this.vixen.db.collection('botvars');
        const clientId = (await vixenVars.findOne({name: 'clientid'})).value;
        const secret = (await vixenVars.findOne({name: 'clientsecret'})).value;
        passport.use(new DiscordStrat({
            clientID: clientId,
            clientSecret: secret,
            callbackURL: 'http://localhost:3000/callback',
            scope: scopes,
            prompt: prompt
        }, function(accessToken, refreshToken, profile, done) {
            process.nextTick(function() {
                return done(null, profile);
            });
        }));

        server.use(session({
            secret: 'keyboard cat',
            resave: false,
            saveUninitialized: false
        }));

        server.use(passport.initialize());
        server.use(passport.session());
        server.get('/', passport.authenticate('discord', {scope: scopes, prompt: prompt }), function() {});
        server.get('/callback',
            passport.authenticate('discord', { failureRedirect: '/' }), function (req, res) { res.redirect('/admin'); }
        );
        server.get('/admin', checkAuth, function(req, res) {
            const userinfo = req.user;
            const app = new Vue({
                data: {
                    tag: `${userinfo.username}#${userinfo.discriminator}`
                },
                template: `<div>You are {{ tag }}</div>`
            });

            renderer.renderToString(app, (err, html) => {
                if (err) return res.status(500).end('Internal Server Error');
                res.end(`
                    <!DOCTYPE html>
                    <html lang="en">
                        <head><title>Vixen Web UI</title></head>
                        <body>${html}</body>
                    </html>
                `);
            });
        });

        server.listen(3000, (err) => {
            if (err) return this.vixen.log(err, 'err');
            this.vixen.log('WebUI is listening on http://localhost:3000');
        });
    }

}

function checkAuth(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.send('not logged in :(');
}

module.exports = WebUI;