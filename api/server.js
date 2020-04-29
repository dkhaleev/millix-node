// importing the dependencies
import https from 'https';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import helmet from 'helmet';
import config from '../core/config/config';
import async from 'async';
import database from '../database/database';
import apiConfig from '../core/config/api.json';
import _ from 'lodash';
import walletUtils from '../core/wallet/wallet-utils';


class Server {
    constructor() {
        this.started = false;
    }

    _loadAPI() {
        return new Promise(resolve => {
            const apiRepository = database.getRepository('api');
            async.eachSeries(apiConfig.endpoint_list, (api, callback) => {
                apiRepository.addAPI(api)
                             .then(() => callback());
            }, () => {
                apiRepository.getAll()
                             .then(apis => resolve(apis));
            });
        });
    }

    initialize() {
        return new Promise(resolve => {
            if (this.started) {
                return resolve();
            }

            this.started = true;

            this._loadAPI().then(apis => {
                const secureAPIs   = _.filter(apis, api => api.permission == 'true');
                const insecureAPIs = _.filter(apis, api => api.permission == 'false');
                console.log('secured', secureAPIs);
                console.log('unsecured', insecureAPIs);


                // defining the Express app
                const app = express();

                const appInfo = {
                    name   : 'millix',
                    version: config.NODE_MILLIX_VERSION
                };

                // adding Helmet to enhance your API's
                // security
                app.use(helmet());

                // using bodyParser to parse JSON bodies
                // into JS objects
                app.use(bodyParser.json());

                // enabling CORS for all requests
                app.use(cors());

                // defining an endpoint to return all ads
                app.get('/', (req, res) => {
                    res.send(appInfo);
                });

                // insecure apis

                insecureAPIs.forEach(insecureAPI => {
                    const module = require('./' + insecureAPI.api_id + '/index');
                    if (module) {
                        module.default.register(app);
                    }
                    else {
                        console.log('api source code not found');
                    }
                });

                // secure apis

                secureAPIs.forEach(secureAPI => {
                    const module = require('./' + secureAPI.api_id + '/index');
                    if (module) {
                        module.default.register(app, true);
                    }
                    else {
                        console.log('api source code not found');
                    }
                });

                app.use(function(err, req, res, next) {
                    if (err.name === 'UnauthorizedError') {
                        res.status(err.status).send({error: err.message});
                        return;
                    }
                    next();
                });

                walletUtils.loadNodeKeyAndCertificate()
                           .then(({private_key_pem: key, certificate_pem: cert}) => {
                               // starting the server
                               const httpsServer = https.createServer({
                                   key,
                                   cert
                               }, app);

                               httpsServer.listen(config.NODE_PORT_API, () => {
                                   console.log('API: listening on port ' + config.NODE_PORT_API);
                               });
                               resolve();
                           });

            });
        });
    }
}


export default new Server();
