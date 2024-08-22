module.exports = async function (self) {
	let variableDefinitions = []
	self.variables.forEach( (varDefinition, varId) => {
		variableDefinitions.push( {variableId: varId, name: varDefinition.name})
	})
	self.setVariableDefinitions(variableDefinitions)
	console.log("VARIABLE DEFINITIONS:", variableDefinitions)
}
