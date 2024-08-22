const { InstanceBase, Regex, runEntrypoint, InstanceStatus } = require('@companion-module/base')
const UpgradeScripts = require('./upgrades')
const configFields = require('./config')
const UpdateActions = require('./actions')
const UpdateFeedbacks = require('./feedbacks')
const UpdateVariableDefinitions = require('./variables')
const mqtt = require('mqtt')

const objectPath = require('object-path')

let debounceFn

class ModuleInstance extends InstanceBase {
	constructor(internal) {
		super(internal)


		this.mqtt_topic_subscriptions = new Map()
		this.mqtt_topic_value_cache = new Map()
		this.devices = new Map()
		this.topicCallbacks = new Map()
		this.variables = new Map()
	}

	async init(config) {
		this.config = config

		if (debounceFn == undefined) {
			const debounceModule = await import('debounce-fn')
			debounceFn = debounceModule.default
		}

		this.debounceUpdateInstanceVariables = debounceFn(this._updateInstanceVariables, {
			wait: 100,
			maxWait: 600,
			before: false,
		})

		this.debounceUpdateVariableDefinitions = debounceFn(this.updateVariableDefinitions, {
			wait: 100,
			maxWait: 600,
			before: false,
		})

		this.debounceUpdateActions = debounceFn(this.updateActions, {
			wait: 300,
			maxWait: 600,
			before: false,
		})

		this.updateStatus(InstanceStatus.Ok)

		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.debounceUpdateVariableDefinitions() // export variable definitions
		this.configUpdated(config)
	}
	// When module gets deleted
	async destroy() {
		this.log('debug', 'destroy')
	}

	async configUpdated(config) {
		this.config = config

		this._initMqtt()
	}

	// Return config fields for web config
	getConfigFields() {
		return configFields
	}

	updateActions() {
		UpdateActions(this)
	}

	updateFeedbacks() {
		UpdateFeedbacks(this)
	}

	updateVariableDefinitions() {
		UpdateVariableDefinitions(this)
	}

	_destroyMqtt() {
		if (this.mqttClient !== undefined) {
			if (this.mqttClient.connected) {
				this.mqttClient.end()
			}
			delete this.mqttClient
		}
	}

	_initMqtt() {
		this._destroyMqtt()

		try {
			if (this.config.broker_ip) {
				const brokerPort = isNaN(parseInt(this.config.port)) ? '' : `:${this.config.port}`
				const brokerUrl = `${this.config.protocol}${this.config.broker_ip}${brokerPort}`

				this.updateStatus(InstanceStatus.Connecting)

				const options = {
					username: this.config.user,
					password: this.config.password,
				}

				if (this.config.clientId) {
					options.clientId = this.config.clientId
				}

				this.mqttClient = mqtt.connect(brokerUrl, options)

				this.mqttClient.on('connect', () => {
					this.updateStatus(InstanceStatus.Ok)

					this._resubscribeToTopics()
				})

				this.mqttClient.on('error', (error) => {
					this.updateStatus(InstanceStatus.UnknownError, error.message || error.toString())

					this.log('error', error.toString())

					if (this.config.restartOnError) {
						setTimeout(() => {
							this._initMqtt()
						}, 1000)
					}
				})

				this.mqttClient.on('offline', () => {
					this.updateStatus(InstanceStatus.Disconnected)
				})

				this.mqttClient.on('message', (topic, message) => {
					try {
						if (topic) {
							this._handleMqttMessage(topic, message ? message.toString() : '')
						}
					} catch (e) {
						this.log('error', `Handle message failed: ${e.toString()}`)
					}
				})

				this._subscribeTopic("tasmota/discovery/#")

			}
		} catch (e) {
			this.updateStatus(InstanceStatus.UnknownError, e.message || e.toString())
		}
	}

	_subscribeTopic(topic, callback=null) {
		this.mqttClient.subscribe(topic, (err) => {
			if (err) {
				this.log('debug', `Failed to subscribe to topic: ${topic}. Error: ${err}`)
				return
			}
			this.log('debug', `Successfully subscribed to topic: ${topic}`)
			if (callback != null) {
				this.topicCallbacks.set(topic, callback)
			} else {
				console.log("OOOOO Not registering callback for", topic)
			}
		})
	}

	_updateInstanceVariables() {
		const vars = []

		for (const [key, uses] of this.mqtt_topic_subscriptions.entries()) {
			Object.values(uses).forEach((use) => {
				if (use.type === 'mqtt_variable') {
					vars.push({
						name: `MQTT value from topic: ${key}`,
						variableId: use.variableName,
					})
				}
			})
		}

		this.log('debug', `Refreshing variable definitions: ${JSON.stringify(vars)}`)
		this.setVariableDefinitions(vars)

		this._updateAllVariables()
	}

	_handleMqttMessage(topic, message) {
		if (topic.startsWith("tasmota/discovery/")) {
			if (topic.endsWith("config")) {
				this._updateDevice(topic, message)
			}
			return
		}
		if (this.topicCallbacks.has(topic)) {
			this.topicCallbacks.get(topic)(topic,message)
		} else {
			console.log("No handler for", topic, message)
		}
	}

	_createDeviceCallback(device) {
		device.callback = (topic, message) => {
			console.log("XXX===XXX", topic, message)
			console.log("Device:", device)

			if (topic == device.get("LWT")) {
				const varname = variableName(topic)
				this._addVariable(varname, 
					`Online state of device ${device.get("nativeName")} (${device.get("friendlyName").join(", ")})`,
					message
				)
				return
			}

			message = JSON.parse(message)
			if (topic == device.get("STATE")) {
				this.log("warn", JSON.stringify(message,null,2))
			}
		}
	}

	_addVariable(id, name, value=null) {
		if (!this.variables.has(id)) {
			this.debounceUpdateVariableDefinitions()
		}
		this.variables.set(id, {name: name, value: value})
	}

	_updateDevice(topic, message) {
		let deviceName = topic.split('/')[2]
		let data = JSON.parse(message)
		console.log("XXX Discover XXX", deviceName, "XXX")
		console.log(JSON.stringify(data))
		if (!this.devices.has(deviceName)) {
			this.devices.set(deviceName, new Map())
		}
		let device = this.devices.get(deviceName)
		device.set('friendlyName', data['fn'].filter(e=> e != null))
		device.get('friendlyName').forEach( (fn) => {
			this._addVariable('Power_'+fn, 'Power state of device '+fn)
		})

		device.set('nativeName', data['hn'])
		device.set('topicName', data['t'])
		let statTopic = this._topicName(data["ft"], "stat", data["t"])
		let teleTopic = this._topicName(data["ft"], "tele", data["t"])
		let cmndTopic = this._topicName(data["ft"], "cmnd", data["t"])
		device.set('cmndTopic', cmndTopic)
		this._createDeviceCallback(device)

		//this._setOrUpdateSubscription(device, statTopic, "STATUS")
		this._setOrUpdateSubscription(device, statTopic, "STATUS8")
		this._setOrUpdateSubscription(device, statTopic, "POWER")

		this._setOrUpdateSubscription(device, teleTopic, "LWT")
		this._setOrUpdateSubscription(device, teleTopic, "STATE")
		this._setOrUpdateSubscription(device, teleTopic, "SENSOR")
		this.runCommand(deviceName, `STATE`, "")
		this.debounceUpdateActions()
	}

	_setOrUpdateSubscription(device, path, topic) {
		let topicName = path + topic
		if (device.has(topic) && device.get(topic) != topicName) {
			console.log("TODO channel changed, reconnect")
		}
		this._subscribeTopic(topicName, device.callback)
		device.set(topic, topicName)

	}

	_topicName(pattern, prefix, topic) {
		return pattern.replace("%prefix%", prefix).replace("%topic%", topic)
	}

	_resubscribeToTopics() {
		console.log('TODO: Resubscribe')
	}

	async runCommand(deviceId, command, param) {
		let topic = `${this.devices.get(deviceId).get("cmndTopic")}${command}`
		console.log(this.devices)
		console.log(`runCommand: ${deviceId}`)
		console.log(`runCommand: => ${topic}: "${param}"`)
		this.mqttClient.publish(topic, param, (err) => {
			if (err) {
				this.log('debug', `Failed to send command "${command}" to topic: ${topic}. Error: ${err}`)
				return
			}
			console.log(`runCommand: PUBLISHED`)
		})
	}
}

function variableName(name) {
	return name.replace(/[^A-Za-z0-9_]/g, "_")
}

runEntrypoint(ModuleInstance, UpgradeScripts)
