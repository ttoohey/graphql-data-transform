# GraphQL data transform

Transform data objects based on GraphQL schema.

Data retrieved from GraphQL queries sometimes needs some manipulation to make
it suitable in different contexts. Some of these are:

* Serialised scalar types (such as dates)
* Populating an object for a form
* Transformation for GraphQL mutation variables

The `graphqlDataTransform` function allows using an existing GraphQL Schema to perform the
transforms to and from the different contexts.

## Usage

Define your app's data transformations

```js
// dataTransform.js
import graphqlDataTransform from 'graphql-data-transform'
import schema from './schema.graphql'

const transforms = {
  // Our schema defines a DateTime scalar type. This is unserialized from query
  // responses to a Date object, and serialized for mutation inputs from a Date object
  DateTime: {
    data: value => new Date(value),
    input: value => value.toISOString()
  },
  // Numbers in our form components are using <input type="string"> and expect a
  // string type as value and produce a string in their `onChange` event.
  // This transform rule ensures integers are transformed for forms
  Int: {
    format: value => String(value),
    parse: value => parseInt(value, 10)
  },
  // The Money scalar type is displayed as a dollar value
  Money: {
    props: value => `$${(value / 100).toFixed(2)}`
  }
}

// we accept data either from GraphQL query responses (`data()`) or from "form"
// components (`parse()`)
const setMethods = ['data', 'parse']

// we send data to GraphQL mutations (`input()`), to "form" components (`format()`)
// or "view" components (`props()`)
const getMethods = ['input', 'format', 'props']

// export the schema type based transformations
export default graphqlDataTransform(schema, transforms, setMethods, getMethods)
```

Convert data using the transformation methods

```js
import types from './dataTransform'

const data = {
  __typename: "Post",
  id: "Post:1",
  timestamp: "2018-12-03T20:54:58.364Z"
}
// `types.Post.data()` is a "set method". It accepts an object and transforms
// it's attributes based on the `Post` type in the GraphQL schema. It returns
// an object that contains "get methods".
// The `.props()` method returns the transformed object suitable for passing
// to components
const props = types.Post.data(data).props()
// -> props: { id: "Post:1", timestamp: <Date> }

const data = { price: 1000 }
// `types.Product.data()` transforms an object based on the `Product` type.
// The `.format()` method returns the object transformed to be suitable for
// passing to form components.
const formData = types.Product.data(data).format()
// -> formData: { price: "1000" }

const formData = { price: "999" }
// `types.ProductInput.parse()` is another "set method". It accepts an object
// that has come from a form component and prepares it for the `ProductInput`
// type. The `.input()` method is used to serialize the object's properties
// to be ready for a GraphQL mutation
const attributes = types.ProductInput.parse(formData).input()
// -> attributes: { price: 999 }

// It's possible to transform values to specialized formats. This example shows
// how a 'Money' type might be used to convert price values (returned as 
// integers from the GraphQL query) to a human-friendly format to pass to
// components
const data = { price: 1000 }
const props = types.Product.data(data).props()
// -> props: { price: "$10.00" }
```
