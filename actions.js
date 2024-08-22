module.exports = function (self) {
	console.log("AAACCCTTTIIIOOONNN UUUPPDDDAAATTTEEE")
	console.log(self.devices)

	let DEVICE_CHOICES = []

	self.devices.forEach( (dev, id) => {
		for (let i=1; i<=dev.get("friendlyName").length; i++) {
			DEVICE_CHOICES.push({
				id: `${id}-${i}`, 
				label: `${dev.get("friendlyName")[i-1]} (${dev.get("nativeName")})`
			})
		}
	})
	console.log("CHOICES", DEVICE_CHOICES)
	let actions = {
		raw_command: {
			name: 'Raw Command',
			options: [
				{
					id: 'device',
					type: 'dropdown',
					label: 'Device',
					choices: DEVICE_CHOICES,
					default: DEVICE_CHOICES[0]?.id
				},
				{
					id: 'input',
					type: 'textinput',
					label: 'Command',
				},
			],
			callback: async (event) => {
				const [command, param] = splitAtFirstSpace(event.options.input)
				const device = event.options.device.split("-")[0]
				self.runCommand(device, command, param)
			}
		},
		power: {
			name: 'Power',
			options: [
				{
					id: 'device',
					type: 'dropdown',
					label: 'Device',
					choices: DEVICE_CHOICES,
					default: DEVICE_CHOICES[0]?.id
				},
				{
					id: 'state',
					type: 'dropdown',
					label: 'Command',
					default: 'TOGGLE',
					choices: [
						{ id: 'ON', label: 'ON'},
						{ id: 'OF', label: 'OFF'},
						{ id: 'TOGGLE', label: 'TOGGLE'},
					]
				}
			],
			callback: async (event) => {
				const [device, subdevice] = event.options.device.split("-")
				self.runCommand(device, `POWER${subdevice}`, event.options.state)
			},
		},
	}

	self.setActionDefinitions(actions)
}

function splitAtFirstSpace(str) {
    // Find the index of the first space character
    const firstSpaceIndex = str.indexOf(' ');

    // If there's no space, return the original string as the first part and an empty string as the second part
    if (firstSpaceIndex === -1) {
        return [str, ''];
    }

    // Split the string into two parts
    const beforeSpace = str.slice(0, firstSpaceIndex);
    const afterSpace = str.slice(firstSpaceIndex + 1);

    return [beforeSpace, afterSpace];
}