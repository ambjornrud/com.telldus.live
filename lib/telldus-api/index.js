'use strict';

const assert = require('assert');
const crypto = require('crypto');
const querystring = require('querystring');
const https = require('https');
const http = require('http');
const { URLSearchParams } = require('url');

const nodeFetch = require('node-fetch');
const OAuth = require('oauth-1.0a');
const constants = require('./constants');

function getFinalUrl(url, qs) {
    return qs ? `${url}?${querystring.stringify(qs)}` : url;
}

const supportedMethods = Object.values(constants.commands).reduce((memo, num) => memo + num, 0);

// https://github.com/johnlemonse/homebridge-telldus/issues/76
async function fetch(url, opts) {
    return nodeFetch(url, {
        ...opts,
        agent: ({ protocol }) => (protocol === 'http:' ? new http.Agent() : new https.Agent({ minVersion: 'TLSv1' })),
    });
}

class Api {
    constructor({ log }) {
        this.log = log;
    }

    async getProfile() {
        return this.request({ path: '/user/profile' });
    }

    async listSensors({ telldusClientId, online, ignored }) {
        const response = await this.request({
            path: '/sensors/list',
            qs: {
                includeIgnored: ignored === true ? 1 : 0,
                includeValues: 1,
                includeScale: 1,
                includeUnit: 1
            }
        });
        return response.sensor
            .filter(s => !telldusClientId || telldusClientId === s.client)
            .filter(s => online === undefined || online === true && (!s.online || s.online === '1') || online === false && (!s.online || s.online !== '1'))
            .filter(s => ignored === undefined || ignored === true && s.ignored === 1 || ignored === false && s.ignored !== 1)
            ;
    }

    async getSensorInfo(id) {
        return this.request({ path: '/sensor/info', qs: { id } });
    }

    async setSensorName(id, name) {
        return this.request({ path: '/sensor/setName', qs: { id, name } });
    }

    async setSensorIgnore(id, ignore) {
        return this.request({ path: '/sensor/setIgnore', qs: { id, ignore } });
    }

    async listClients() {
        return this.request({ path: '/clients/list' });
    }

    async listDevices({ telldusClientId, deviceTypes, methods }) {
        const response = await this.request({
            path: '/devices/list',
            qs: { supportedMethods, extras: 'devicetype,parameters,transport' }
        });
        const deviceTypeIds = deviceTypes && deviceTypes.length > 0 ? deviceTypes.map(d => d.id) : undefined;
        return response.device
            .filter(d => !telldusClientId || telldusClientId === d.client)
            .filter(d => !d.deviceType || !deviceTypeIds || deviceTypeIds.includes(d.deviceType.toUpperCase()))
            .filter(d => !d.methods || !methods || methods.length === 0 ||
                methods.map(m => (m & d.methods) > 0 ? 1 : 0).reduce((a, b) => a + b, 0) > 0)
            .map(d => {
                return {
                    ...d,
                    deviceTypeDescr: d.deviceType ? constants.DEVICE_TYPES_INVERTED[d.deviceType.toUpperCase()] : undefined
                }
            });
    }

    async getDeviceInfo(id) {
        const d = await this.request({ path: '/device/info', qs: { id, supportedMethods } });
        return {
            ...d,
            deviceTypeDescr: d.deviceType ? constants.DEVICE_TYPES_INVERTED[d.deviceType.toUpperCase()] : undefined
        };
    }

    async addDevice(device) {
        return this.request({ path: '/device/setName', qs: device });
    }

    async deviceLearn(id) {
        return this.request({ path: '/device/learn', qs: { id } });
    }

    async setDeviceModel(id, model) {
        return this.request({ path: '/device/setModel', qs: { id, model } });
    }

    async setDeviceName(id, name) {
        return this.request({ path: '/device/setName', qs: { id, name } });
    }

    async setDeviceParameter(id, parameter, value) {
        return this.request({ path: '/device/setParameter', qs: { id, parameter, value } });
    }

    async setDeviceProtocol(id, protocol) {
        return this.request({ path: '/device/setProtocol', qs: { id, protocol } });
    }

    async removeDevice(id) {
        return this.request({ path: '/device/remove', qs: { id } });
    }

    async bellDevice(id) {
        return this.request({ path: '/device/bell', qs: { id } });
    }

    async dimDevice(id, level) {
        return this.request({ path: '/device/dim', qs: { id, level } });
    }

    async onOffDevice(id, on) {
        return this.request({ path: `/device/turn${on ? 'On' : 'Off'}`, qs: { id } });
    }

    async stopDevice(id) {
        return this.request({ path: '/device/stop', qs: { id } });
    }

    async upDownDevice(id, up) {
        return this.request({ path: `/device/${up ? 'up' : 'down'}`, qs: { id } });
    }

    async commandDevice(id, command, value) {
        if (!constants.commands[command]) throw new Error('Invalid command supplied');
        return this.request({ path: '/device/command', qs: { id, method: command, value } });
    }

    async listEvents() {
        return this.request({ path: '/events/list' });
    }

    async systemInfo() {
        return this.request({ path: '/system/info' });
    }

    /**
     * Returns device history
     * @param id device id
     * @param from timestamp in seconds
     * @param to timestamp in seconds
     * @returns {*} a Promise
     */
    async deviceHistory(id, from, to) {
        return this.request({ path: '/device/history', qs: { id, from, to } });
    }
}

class LocalApi extends Api {
    constructor({ host, accessToken, tokenRefreshIntervalSeconds = 60 * 60, log }) {
        super({ log });

        this.host = host;
        this.accessToken = accessToken;
        this.tokenRefreshIntervalSeconds = tokenRefreshIntervalSeconds;

        this.lastRefresh = 0;
    }

    getBaseUrl() {
        return `http://${this.host}/api`;
    }

    async getRequestToken(appName) {
        const response = await fetch(`${this.getBaseUrl()}/token`, {
            method: 'PUT',
            body: new URLSearchParams({ app: appName }),
        });
        assert(response.status, 200);
        const body = await response.json();
        this.log('getRequestToken', appName, response.status, body);
        return body;
    }

    async exchangeRequestToken(requestToken) {
        const response = await fetch(`${this.getBaseUrl()}/token?token=${requestToken}`);
        assert(response.status, 200);
        const body = await response.json();
        this.log('exchangeRequestToken', requestToken, response.status, body);
        if (body.error) return undefined;
        return body.token;
    }

    async refreshAccessToken() {
        if (new Date().getTime() - this.lastRefresh < this.tokenRefreshIntervalSeconds * 1000) return;
        this.lastRefresh = new Date().getTime();

        const response = await fetch(`${this.getBaseUrl()}/refreshToken?token=${this.accessToken}`, {
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
            },
        });

        assert(response.status, 200);

        const body = await response.json();

        if (!body.expires) {
            this.log(body);
            throw new Error(`Unable to refresh access token: ${body.error}`);
        }

        this.log('Refreshed access token, expires', new Date(body.expires * 1000).toISOString());
    }

    async request({ method = 'GET', path, qs }) {
        await this.refreshAccessToken();

        const finalUrl = getFinalUrl(`${this.getBaseUrl()}${path}`, qs);

        const response = await fetch(finalUrl, {
            method,
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
            },
        });

        assert.equal(response.status, 200);
        return response.json();
    }
}

class LiveApi extends Api {
    constructor(config, { log }) {
        super({ log });
        this.config = config;
    }

    async request({ method = 'GET', path, qs }) {
        const telldusLiveBaseUrl = 'https://pa-api.telldus.com/json';
//        <html><body><h1>403 Forbidden</h1>
//        Request forbidden by administrative rules.
//        </body></html>

        const {
            key,
            secret,
            tokenKey,
            tokenSecret,
        } = this.config;

        const oauth = OAuth({
            consumer: {
                key,
                secret,
            },
            signature_method: 'HMAC-SHA1',
            hash_function: (baseString, key2) => crypto.createHmac('sha1', key2).update(baseString).digest('base64'),
        });

        const finalUrl = getFinalUrl(`${telldusLiveBaseUrl}${path}`, qs);

        const sleepBetweenRetries = 60;  // in seconds
        const maxRetries = 3;
        var retries = 0;
        var response = null;
        while(retries++ < maxRetries) {
            response = await fetch(finalUrl, {
                method,
                headers: {
                    ...oauth.toHeader(oauth.authorize(
                        { url: finalUrl, method },
                        { key: tokenKey, secret: tokenSecret },
                    )),
                },
            });

    //        this.log('Header date:', response.headers.get('date'));
            
            if(response.status === 200) {
                this.log('Request ' + retries + ' success:', response.status, response.statusText, method, finalUrl);
                //            response.clone().json().then(data => this.log('payload OK:', JSON.stringify(data, null, 2)));
                break;
            } else {
                this.log('Request ' + retries + ' failed:', response.status, response.statusText, method, finalUrl);
                response.clone().text().then(data => this.log('payload fail:', data));
            }
            if(response.status === 429) {
                await this.sleep(sleepBetweenRetries * 1000);
            } else {
                break;
            }
        }

        assert.equal(response.status, 200);
        return response.json();
    }

    // Define a sleep function that returns a promise
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
// 2024-02-07T13:12:45.962Z [log] [ManagerDrivers] [Driver:ClientLocal] [Device:bfbc01d2-3125-44ec-a068-de20956f4fbd] Refreshed access token, expires 2025-02-06T13:12:45.000Z
module.exports = { LocalApi, LiveApi };
