function simpleArguments(
  argumentDefinitions: ArgumentDefinitions,
  options: Options = {}
): SimpleArguments {
  const definitionsData: DefinitionsData =
    setupDefinitionsData(argumentDefinitions);
  let rawArguments = options.arguments;
  if (!rawArguments || rawArguments.length === 0) {
    rawArguments = process.argv.slice(2);
  }
  const cliArguments: SimpleArguments = loopRawArguments(
    rawArguments,
    definitionsData,
    options
  );
  //console.log(cliArguments);
  return cliArguments;
}
export default simpleArguments;

function setupDefinitionsData(
  argumentDefinitions: ArgumentDefinitions
): DefinitionsData {
  const definitions: Definitions = {};
  const aliases: Aliases = {};
  let defaultOption: string | undefined;
  for (const argumentDefinition of argumentDefinitions) {
    if (argumentDefinition) {
      definitions[argumentDefinition.name] = argumentDefinition;
      if (argumentDefinition.alias) {
        const alias = argumentDefinition.alias;
        aliases[alias] = argumentDefinition.name;
      }
      if (argumentDefinition.default) {
        defaultOption = argumentDefinition.name;
      }
    }
  }
  return { definitions: definitions, aliases: aliases, default: defaultOption };
}
function loopRawArguments(
  rawArguments: string[],
  definitionsData: DefinitionsData,
  options: Options
): SimpleArguments {
  let cliArguments: SimpleArguments = {};
  const cliData = {
    options: options,
    definitions: definitionsData.definitions,
    aliases: definitionsData.aliases,
    default: definitionsData.default,
    rawArguments: rawArguments,
    argumentIndex: 0,
  };
  while (cliData.argumentIndex < rawArguments.length) {
    if (rawArguments[cliData.argumentIndex]?.startsWith("--")) {
      cliArguments = rawArgumentToSimpleArguments(cliArguments, cliData);
    } else if (rawArguments[cliData.argumentIndex]?.startsWith("-")) {
      cliArguments = rawAliasToSimpleArguments(cliArguments, cliData);
    } else if (cliData.default) {
      parseDefaultOption(cliArguments, cliData);
    }
    cliData.argumentIndex++;
  }
  return cliArguments;
}
function rawAliasToSimpleArguments(
  cliArguments: SimpleArguments,
  cliData: CliData
): SimpleArguments {
  const rawArgument = cliData.rawArguments[cliData.argumentIndex];
  if (!rawArgument) return cliArguments;
  const aliasOption: string = rawArgument.slice(1).replace(/=.+$/, "");
  if (aliasOption.length === 1) {
    const possibleProperty = cliData.aliases[aliasOption];
    if (possibleProperty) {
      const re = new RegExp("^-" + aliasOption);
      cliData.rawArguments[cliData.argumentIndex] =
        cliData.rawArguments[cliData.argumentIndex]?.replace(
          re,
          "--" + possibleProperty
        ) || "-" + aliasOption;
    }
    return rawArgumentToSimpleArguments(cliArguments, cliData);
  } else {
    return convertMultipleAliases(cliArguments, aliasOption, cliData);
  }
}
function convertMultipleAliases(
  cliArguments: SimpleArguments,
  aliasOption: string,
  cliData: CliData
): SimpleArguments {
  const aliasOptions = [...aliasOption];
  cliData.rawArguments.splice(cliData.argumentIndex, 1);
  let lastProperty;
  for (const [a, singleAlias] of aliasOptions.entries()) {
    const possibleProperty = cliData.aliases[singleAlias];
    if (
      possibleProperty &&
      (cliData.definitions[possibleProperty]?.type === Boolean ||
        a === aliasOptions.length - 1)
    ) {
      const propertyToInsert = "--" + possibleProperty;
      cliData.rawArguments.splice(cliData.argumentIndex, 0, propertyToInsert);
      cliArguments = rawArgumentToSimpleArguments(cliArguments, cliData);
      cliData.argumentIndex++;
    } else {
      lastProperty = singleAlias;
    }
  }
  if (lastProperty) {
    const possibleProperty = cliData.aliases[lastProperty];
    if (possibleProperty) {
      const propertyToInsert = "--" + possibleProperty;
      cliData.rawArguments.splice(cliData.argumentIndex, 0, propertyToInsert);
      cliArguments = rawArgumentToSimpleArguments(cliArguments, cliData);
      cliData.argumentIndex++;
    }
  }
  return cliArguments;
}
function rawArgumentToSimpleArguments(
  cliArguments: SimpleArguments,
  cliData: CliData
): SimpleArguments {
  const rawArgument = cliData.rawArguments[cliData.argumentIndex];
  if (!rawArgument) return cliArguments;
  const optionName: string = rawArgument.slice(2).replace(/=.+$/, "");
  const optionDefinition = cliData.definitions[optionName];
  if (!optionDefinition) return cliArguments;
  const selectedOption: SelectedOption = {
    name: optionName,
    definition: optionDefinition,
  };
  if (optionDefinition.type === Boolean) {
    return booleanArguments(cliArguments, selectedOption);
  } else {
    return optionDefinition.multiple
      ? multipleArguments(cliArguments, cliData, selectedOption)
      : singleArguments(cliArguments, cliData, selectedOption);
  }
}
function booleanArguments(
  cliArguments: SimpleArguments,
  selectedOption: SelectedOption
): SimpleArguments {
  if (selectedOption.definition.count) {
    const possibleValue = cliArguments[selectedOption.name];
    cliArguments[selectedOption.name] =
      possibleValue && typeof possibleValue === "number"
        ? possibleValue + 1
        : 1;
  } else {
    cliArguments[selectedOption.name] = true;
  }
  return cliArguments;
}
function multipleArguments(
  cliArguments: SimpleArguments,
  cliData: CliData,
  selectedOption: SelectedOption
): SimpleArguments {
  if (!cliArguments[selectedOption.name]) {
    cliArguments[selectedOption.name] = [];
  }
  const argumentValue = cliArguments[selectedOption.name];
  if (typeof argumentValue !== "object") return cliArguments;
  if (cliData.rawArguments[cliData.argumentIndex]?.indexOf("=") !== -1) {
    const value = validateArgumentValue(
      cliData.rawArguments[cliData.argumentIndex]?.split("=")[1],
      selectedOption
    );
    if (value) {
      argumentValue.push(value);
    }
    cliData.argumentIndex++;
    return cliArguments;
  }
  while (
    cliData.rawArguments[cliData.argumentIndex + 1] &&
    !cliData.rawArguments[cliData.argumentIndex + 1]?.startsWith("-")
  ) {
    const value = validateArgumentValue(
      cliData.rawArguments[cliData.argumentIndex + 1],
      selectedOption
    );
    if (value) {
      argumentValue.push(value);
    }
    cliData.argumentIndex++;
    if (cliData.options.lazy || selectedOption.definition.lazy) {
      return cliArguments;
    }
  }
  return cliArguments;
}
function singleArguments(
  cliArguments: SimpleArguments,
  cliData: CliData,
  selectedOption: SelectedOption
): SimpleArguments {
  if (cliData.rawArguments[cliData.argumentIndex]?.indexOf("=") !== -1) {
    const value = validateArgumentValue(
      cliData.rawArguments[cliData.argumentIndex]?.split("=")[1],
      selectedOption
    );
    if (value) {
      cliArguments[selectedOption.name] = value;
    }
  } else if (
    !cliData.rawArguments[cliData.argumentIndex + 1]?.startsWith("-")
  ) {
    const value = validateArgumentValue(
      cliData.rawArguments[cliData.argumentIndex + 1],
      selectedOption
    );
    if (value) {
      cliArguments[selectedOption.name] = value;
    }
  }
  return cliArguments;
}
function parseDefaultOption(
  cliArguments: SimpleArguments,
  cliData: CliData
): SimpleArguments {
  const optionName = cliData.default;
  if (!optionName) return cliArguments;
  const optionDefinition = cliData.definitions[optionName];
  if (!optionDefinition) return cliArguments;
  const selectedOption: SelectedOption = {
    name: optionName,
    definition: optionDefinition,
  };
  const value = validateArgumentValue(
    cliData.rawArguments[cliData.argumentIndex],
    selectedOption
  );
  if (value) {
    if (selectedOption.definition.multiple) {
      if (typeof cliArguments[selectedOption.name] !== "object")
        cliArguments[selectedOption.name] = [];
      const argumentValue = cliArguments[selectedOption.name];
      if (typeof argumentValue !== "object") return cliArguments;
      argumentValue.push(value);
      cliArguments[selectedOption.name] = argumentValue;
    } else {
      cliArguments[selectedOption.name] = value;
    }
  }
  return cliArguments;
}
function validateArgumentValue(
  input: string | undefined,
  selectedOption: SelectedOption
): string | number | undefined {
  if (!input) return;
  if (selectedOption.definition.type === Number && !Number.isNaN(+input)) {
    return +input; //+ converts to number and removes ending 0s
  } else if (selectedOption.definition.type === String) {
    return input;
  } else {
    return;
  }
}

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */
type ArgumentDefinitions = ArgumentDefinition[];

interface ArgumentDefinition {
  name: string;
  alias?: string;
  type: BooleanConstructor | StringConstructor | NumberConstructor;
  multiple?: boolean;
  count?: boolean;
  default?: boolean;
  lazy?: boolean;
}

interface Options {
  arguments?: string[];
  lazy?: boolean;
}

interface DefinitionsData {
  definitions: Definitions;
  aliases: Aliases;
  default: string | undefined;
}

interface Definitions {
  [key: string]: ArgumentDefinition;
}
interface Aliases {
  [key: string]: string;
}

interface CliData {
  options: Options;
  definitions: Definitions;
  aliases: Aliases;
  default: string | undefined;
  rawArguments: string[];
  argumentIndex: number;
}

interface SelectedOption {
  name: string;
  definition: ArgumentDefinition;
}

export interface SimpleArguments {
  [key: string]: string | number | boolean | (string | number)[];
}
