'use strict';

const Homey = require('homey');
const { LocalApi } = require('./telldus-api/index');

module.exports = class BaseClientDevice extends Homey.Device {

    onDeleted() {
        this._deleted = true;
        this.clearCheckData();
    }

    getId() {
        return this.getData().id;
    }

    getUuid() {
        return this.getData().uuid;
    }

    getApi() {
        return this._api;
    }

    getShortName() {
        return undefined;
    }

    async onSettings(oldSettingsObj, newSettingsObj, changedKeysArr, callback) {
      if (changedKeysArr.includes('Polling_Interval')) {
        this.scheduleCheckData(newSettingsObj.Polling_Interval);
      }
  
      if (changedKeysArr.includes('Auth_Token') || changedKeysArr.includes('Host')) {
        this.log("changedKeysArr: " + JSON.stringify(changedKeysArr, null, 2));
        this.log("newSettingsObj: " + JSON.stringify(newSettingsObj, null, 2));
  
        const keys = this.getStoreValue('keys');
        var accessToken = keys.access_token;
        this.log('Stored accessToken: ' + accessToken);
        var host = keys.ip_address;
        this.log('Stored host: ' + host);
  
        if (changedKeysArr.includes('Auth_Token')) {
          accessToken = newSettingsObj.Auth_Token;
        }
        if (changedKeysArr.includes('Host')) {
          host = newSettingsObj.Host;
        }
        this._keys = {
          ip_address: host,
          access_token: accessToken,
        };
        this.setStoreValue('keys', this._keys);
        //kjør OnInit() dvs
        this._api = new LocalApi({ host, accessToken, log: this.log });
      }
      
      callback(null, true);
    }

    async checkData() {
        if (this._deleted) {
            return;
        }
        try {
            this.clearCheckData();
            await this.fetchClientState();
            await this.fetchSensorValues();
            await this.fetchDevicesValues();
        } catch (err) {
            this.log('checkData error', err);
        } finally {
            this.scheduleCheckData();
        }
    }

    clearCheckData() {
        if (this.curTimeout) {
            clearTimeout(this.curTimeout);
            this.curTimeout = undefined;
        }
    }

    async scheduleCheckData(seconds) {
        if (this._deleted) {
            return;
        }
        this.clearCheckData();
        let interval = seconds;
        if (!interval) {
            let settings = await this.getSettings();
            interval = settings.Polling_Interval || 30;
        }
        this.curTimeout = setTimeout(this.checkData.bind(this), interval * 1000);
    }

};