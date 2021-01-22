const defaultTransform = (value) => value;
const builtins = ["Int", "Float", "String", "Boolean", "ID"];
const filterScalar = ({ kind }) =>
  ["ScalarTypeDefinition", "EnumTypeDefinition"].includes(kind);
const filterObject = ({ kind }) =>
  [
    "ObjectTypeDefinition",
    "InputObjectTypeDefinition",
    "InterfaceTypeDefinition",
  ].includes(kind);
const fieldByName = (fields, field) => ({
  ...fields,
  [field.name.value]: field,
});
const byObjectType = (c, item) => ({ ...c, [item.name.value]: item });

export default function graphqlDataTransform(
  schema,
  transforms = {},
  setMethods = [],
  getMethods = []
) {
  const types = {};
  const scalars = schema.definitions
    .filter(filterScalar)
    .map((item) => item.name.value);
  const objects = schema.definitions.filter(filterObject);
  const objectsByType = objects.reduce(byObjectType, {});
  const getObjectFieldValue = (
    method,
    [value, transformFn],
    fieldDefinitionType,
    mode
  ) => {
    if (fieldDefinitionType.kind === "NamedType") {
      const name = fieldDefinitionType.name.value;
      let Type = types[name];
      if (Type === undefined && value && value.__typename) {
        Type = types[value.__typename]; // map interface by typename (TODO)
      }
      if (Type === undefined) {
        throw new Error(
          `Unable to transform data for type ${fieldDefinitionType.name.value}`
        );
      }
      return mode
        ? Type[method](transformFn(name)(value)).get()
        : Type.set(value)[method]();
    }
    if (fieldDefinitionType.kind === "NonNullType") {
      return getObjectFieldValue(
        method,
        [value, transformFn],
        fieldDefinitionType.type,
        mode
      );
    }
    if (fieldDefinitionType.kind === "ListType") {
      return value.map((v) =>
        getObjectFieldValue(
          method,
          [v, transformFn],
          fieldDefinitionType.type,
          mode
        )
      );
    }
    throw new Error(
      `Unhandled field definition for kind ${fieldDefinitionType.kind}`
    );
  };
  [...builtins, ...scalars].forEach((name) => {
    const transform = (method) =>
      (transforms[name] || {})[method] || defaultTransform;
    const getReducer = (value) => (o, method) => ({
      ...o,
      [method]: () => transform(method)(value),
    });
    const setReducer = (o, method) => ({
      ...o,
      [method]: (value) => set(transform(method)(value)),
    });
    const set = (value) =>
      getMethods.reduce(getReducer(value), { get: () => value });
    types[name] = setMethods.reduce(setReducer, { set });
  });
  objects.forEach((object) => {
    const name = object.name.value;
    const fields = (typename) => {
      if (object.kind === "InterfaceTypeDefinition" && typename) {
        return objectsByType[typename].fields.reduce(fieldByName, {});
      }
      return object.fields.reduce(fieldByName, {});
    };
    const transform = (method) => (data, mode = false, original) => {
      if (data === undefined || data === null) {
        return data;
      }
      const _fields = fields(data.__typename);
      const transformFn = (name) =>
        (transforms[name] || {})[method] || defaultTransform;
      const value = Object.entries(
        mode ? transformFn(name)(data) : data
      ).reduce(
        (result, [key, value]) => {
          if (!_fields.hasOwnProperty(key)) {
            return result;
          }
          const fieldDefinitionType = _fields[key].type;
          result[key] = getObjectFieldValue(
            method,
            mode ? [value, transformFn] : [value, (name) => defaultTransform],
            fieldDefinitionType,
            mode
          );
          return result;
        },
        mode ? { __typename: data.__typename } : {}
      );
      return mode ? value : transformFn(name)(value, original);
    };
    const getReducer = (value, original) => (o, method) => ({
      ...o,
      [method]: () => transform(method)(value, false, original),
    });
    const setReducer = (o, method) => ({
      ...o,
      [method]: (value) => set(transform(method)(value, true), value),
    });
    const set = (value, original) =>
      getMethods.reduce(getReducer(value, original), { get: () => value });
    types[name] = setMethods.reduce(setReducer, {
      set: (value) => set(value, value),
    });
  });
  return types;
}
