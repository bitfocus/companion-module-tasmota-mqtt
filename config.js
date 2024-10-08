const configFields = [
	{
		type: 'dropdown',
		id: 'protocol',
		label: 'Protocol',
		width: 4,
		default: 'mqtt://',
		choices: [
			{ id: 'mqtt://', label: 'mqtt://' },
			{ id: 'mqtts://', label: 'mqtts://' },
		],
	},
	{
		type: 'textinput',
		id: 'broker_ip',
		width: 4,
		label: 'Broker (Hostname/IP)',
	},
	{
		type: 'number',
		id: 'port',
		width: 4,
		label: 'Port',
		default: 1883,
		min: 1,
		max: 65535,
	},
	{
		type: 'textinput',
		id: 'user',
		width: 6,
		label: 'Username',
	},
	{
		type: 'textinput',
		id: 'password',
		width: 6,
		label: 'Password',
	},
	{
		type: 'textinput',
		id: 'clientId',
		width: 6,
		label: 'MQTT Client ID',
		default: 'bitfocus-companion-mqtt',
	},
	{
		type: 'checkbox',
		id: 'restartOnError',
		width: 6,
		label: 'Restart module on connection error',
		default: true,
	}
]

module.exports = configFields