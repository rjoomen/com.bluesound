'use strict';

const Homey = require('homey');
const Util = require('/lib/util.js');

class BluesoundDevice extends Homey.Device {

  onInit() {
    if (!this.util) this.util = new Util({homey: this.homey });

    this.setAvailable();
    this.pollDevice();

    // LISTENERS FOR UPDATING CAPABILITIES
    this.registerCapabilityListener('speaker_playing', async (value) => {
      const command = value ? 'Play' : 'Pause';
      return await this.util.sendCommand(command, this.getSetting('address'), this.getSetting('port'));
    });

    this.registerCapabilityListener('speaker_prev', async (value) => {
      try {
        // send command twice because first command jumps to start of current track
        await this.util.sendCommand('Back', this.getSetting('address'), this.getSetting('port'));
        await this.util.sendCommand('Back', this.getSetting('address'), this.getSetting('port'));
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    });

    this.registerCapabilityListener('speaker_next', async (value) => {
      return await this.util.sendCommand('Skip', this.getSetting('address'), this.getSetting('port'));
    });

    this.registerCapabilityListener('volume_set', async (value) => {
      this.setStoreValue('mutevol', value.toFixed(2));
      const volume = value.toFixed(2) * 100;
      const path = 'Volume?level='+ volume;
      return await this.util.sendCommand(path, this.getSetting('address'), this.getSetting('port'));
    });

    this.registerCapabilityListener('volume_mute', async (value) => {
      if (value) {
        const path = 'Volume?level=0';
        return await this.util.sendCommand(path, this.getSetting('address'), this.getSetting('port'));
      } else {
        return await this.setCapabilityValue('volume_set', this.getStoreValue('mutevol'));
      }
    });

  }

  onDeleted() {
    clearInterval(this.pollingInterval);
    clearInterval(this.pingInterval);
  }

  // HELPER FUNCTIONS
  pollDevice() {
    clearInterval(this.pollingInterval);
    clearInterval(this.pingInterval);

    this.pollingInterval = setInterval(async () => {
      try {
        let result = await this.util.getBluesound(this.getSetting('address'), this.getSetting('port'));

        if (!this.getAvailable()) {
          this.setAvailable();
        }

        // capability speaker_playing
        if ((result.state == 'play') || (result.state == 'stream')) {
          // playing
          if (!this.getCapabilityValue('speaker_playing')) {
            this.setCapabilityValue('speaker_playing', true);
            this.homey.flow.getDeviceTriggerCard('start_playing').trigger(this, {artist: result.artist, track: result.track, album: result.album}, {});
          }
        } else {
          // not playing
          if (this.getCapabilityValue('speaker_playing')) {
            this.setCapabilityValue('speaker_playing', false);
            this.homey.flow.getDeviceTriggerCard('stop_playing').trigger(this, {}, {});
          }
        }

        // capability volume_set and volume_mute
        var volume = result.volume / 100;
        if (this.getCapabilityValue('volume_set') != volume) {
          this.setCapabilityValue('volume_set', volume);
        }
        if (volume === 0 && this.getCapabilityValue('volume_mute') === false) {
          this.setCapabilityValue('volume_mute', true);
        } else if (volume != 0 && this.getCapabilityValue('volume_mute') === true) {
          this.setCapabilityValue('volume_mute', false);
        }

        // stores values
        if (this.getStoreValue('state') != result.state) {
          this.setStoreValue('state', result.state);
        }
        if (this.getStoreValue('service') != result.service) {
          this.setStoreValue('service', result.service);
        }
        if (this.getStoreValue('shuffle') != result.shuffle) {
          this.setStoreValue('shuffle', result.shuffle);
        }
        if (this.getStoreValue('repeat') != result.repeat) {
          this.setStoreValue('repeat', result.repeat);
        }
        if (this.getStoreValue('artist') != result.artist && (result.state !== 'stop' || result.state !== 'pause')) {
          this.setStoreValue('artist', result.artist);
          if (result.artist !== 'Not available') {
            this.homey.flow.getDeviceTriggerCard('artist_changed').trigger(this, {artist: result.artist, track: result.track, album: result.album}, {})
          }
        }
        if (this.getStoreValue('track') != result.track && (result.state !== 'stop' || result.state !== 'pause')) {
          this.setStoreValue('track', result.track);
          if (result.track !== 'Not available') {
            this.homey.flow.getDeviceTriggerCard('track_changed').trigger(this, {artist: result.artist, track: result.track, album: result.album}, {})
          }
        }
        if (this.getStoreValue('album') != result.album && (result.state !== 'stop' || result.state !== 'pause')) {
          this.setStoreValue('album', result.album);
        }
      } catch (error) {
        this.log(error);
        this.setUnavailable(this.homey.__('device.unreachable'));
        this.pingDevice();
      }
    }, 1000 * this.getSetting('polling'));
  }

  pingDevice() {
    clearInterval(this.pollingInterval);
    clearInterval(this.pingInterval);

    this.pingInterval = setInterval(async () => {
      try {
        let result = await this.util.getBluesound(this.getSetting('address'), this.getSetting('port'));
        this.setAvailable();
        this.pollDevice();
      } catch (error) {
        this.log('Device is not reachable, pinging every 63 seconds to see if it comes online again.');
      }
    }, 63000);
  }

}

module.exports = BluesoundDevice;
