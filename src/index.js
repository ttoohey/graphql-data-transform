const defaultTransform = value => value;
const builtins = ["Int", "Float", "String", "Boolean", "ID"];
const filterScalar = ({ kind }) =>
  ["ScalarTypeDefinition", "EnumTypeDefinition"].includes(kind);
const filterObject = ({ kind }) =>
  ["ObjectTypeDefinition", "InputObjectTypeDefinition"].includes(kind);
const fieldByName = (fields, field) => ({
  ...fields,
  [field.name.value]: field
});

export default function graphqlDataTransform(
  schema,
  transforms = {},
  setMethods = [],
  getMethods = []
) {
  const types = {};
  const scalars = schema.definitions
    .filter(filterScalar)
    .map(item => item.name.value);
  const objects = schema.definitions.filter(filterObject);
  const getObjectFieldValue = (method, value, fieldDefinitionType, mode) => {
    if (fieldDefinitionType.kind === "NamedType") {
      const Type = types[fieldDefinitionType.name.value];
      return mode ? Type[method](value).get() : Type.set(value)[method]();
    }
    if (fieldDefinitionType.kind === "NonNullType") {
      return getObjectFieldValue(method, value, fieldDefinitionType.type, mode);
    }
    if (fieldDefinitionType.kind === "ListType") {
      return value.map(v =>
        getObjectFieldValue(method, v, fieldDefinitionType.type, mode)
      );
    }
  };
  [...builtins, ...scalars].forEach(name => {
    const transform = method =>
      (transforms[name] || {})[method] || defaultTransform;
    const getReducer = value => (o, method) => ({
      ...o,
      [method]: () => transform(method)(value)
    });
    const setReducer = (o, method) => ({
      ...o,
      [method]: value => set(transform(method)(value))
    });
    const set = value =>
      getMethods.reduce(getReducer(value), { get: () => value });
    types[name] = setMethods.reduce(setReducer, { set });
  });
  objects.forEach(object => {
    const name = object.name.value;
    const fields = object.fields.reduce(fieldByName, {});
    const transform = method => (object, mode = false) => {
      if (object === undefined || object === null) {
        return object
      }
      const transformFn = (transforms[name] || {})[method] || defaultTransform;
      const value = Object.entries(object).reduce((result, [key, value]) => {
        if (!fields.hasOwnProperty(key)) {
          return result;
        }
        result[key] = getObjectFieldValue(
          method,
          mode ? transformFn(value) : value,
          fields[key].type,
          mode
        );
        return result;
      }, {});
      return mode ? value : transformFn(value);
    };
    const getReducer = value => (o, method) => ({
      ...o,
      [method]: () => transform(method)(value)
    });
    const setReducer = (o, method) => ({
      ...o,
      [method]: value => set(transform(method)(value, true))
    });
    const set = value =>
      getMethods.reduce(getReducer(value), { get: () => value });
    types[name] = setMethods.reduce(setReducer, { set });
  });
  return types;
}
