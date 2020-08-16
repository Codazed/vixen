/* eslint-disable require-jsdoc */
const DiscordStrat = require('passport-discord').Strategy;
const passport = require('passport');
const app = require('express')();
const io = require('socket.io')();
const session = require('express-session');

const scopes = ['identify', 'guilds'];
const prompt = 'consent';

const frontendURL = 'http://localhost:9090';

class WebUI {
    constructor(vixen) {
        this.vixen = vixen;

        this.run();
    }

    async stop() {
        this.main.close();
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
            callbackURL: 'http://localhost:9090/callback',
            scope: scopes,
            prompt: prompt,
        }, function(accessToken, refreshToken, profile, done) {
            process.nextTick(function() {
                return done(null, profile);
            });
        }));

        app.use(session({
            secret: 'keyboard cat',
            resave: false,
            saveUninitialized: false,
        }));

        app.use(passport.initialize());
        app.use(passport.session());
        app.get('/oauth', passport.authenticate('discord', {scope: scopes, prompt: prompt}), function() {});
        app.get('/callback',
            passport.authenticate('discord', {failureRedirect: '/'}), function(req, res) {
                res.redirect(frontendURL);
            },
        );

        // server.get('/admin', checkAuth, function(req, res) {
        //     const userinfo = req.user;
        //     const app = new Vue({
        //         data: {
        //             tag: `${userinfo.username}#${userinfo.discriminator}`
        //         },
        //         template: `<div>You are {{ tag }}</div>`
        //     });


        //     renderer.renderToString(app, (err, html) => {
        //         if (err) return res.status(500).end('Internal Server Error');
        //         res.end(`
        //             <!DOCTYPE html>
        //             <html lang="en">
        //                 <head><title>Vixen Web UI</title></head>
        //                 <body>${html}</body>inspire
        //             </html>
        //         `);
        //     });
        // });

        app.get('/logout', checkAuth, async (req, res) => {
            req.logOut();
            res.redirect(frontendURL);
        });

        app.get('/api/status', checkAuth, async (req, res) => {
            const managedServers = [];
            this.vixen.bot.guilds.cache.forEach((guild) => {
                const member = guild.members.resolve(req.user.id);
                if (member.permissions.has('MANAGE_SERVER')) {
                    managedServers.push({
                        name: guild.name,
                        id: guild.id,
                    });
                }
            });
            const response = {
                authed: true,
                userData: req.user,
                managedGuilds: managedServers,
            };
            res.send(response);
        });

        app.get('/api/guilds', checkAuth, async (req, res) => {
            const guilds = [];
            this.vixen.bot.guilds.cache.forEach((guild) => {
                guilds.push(guild);
            });
            res.send(guilds);
        });

        app.get('/api/guilds/:id', checkAuth, async (req, res) => {
            const vixenGuilds = this.vixen.db.collection('guilds');
            const persistentInfo = await vixenGuilds.findOne({id: req.params.id});
            const liveInfo = this.vixen.guildsData.get(req.params.id);
            const guildInfo = {
                persistent: persistentInfo,
                live: liveInfo,
            };
            guildInfo.icon = this.vixen.bot.guilds.cache.get(req.params.id).iconURL();
            res.send(guildInfo);
        });

        this.main = app.listen(3000, (err) => {
            if (err) return this.vixen.log(err, 'err');
            this.vixen.log('REST API is listening on http://localhost:3000');
            io.listen(6000);
            io.on('connection', () => {
                this.vixen.log('Websocket connected');
            });
            this.vixen.on('update', (changed) => {
                io.emit('update', changed);
            });
        });
    }
}

function checkAuth(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.send({authed: false});
}

module.exports = WebUI;
