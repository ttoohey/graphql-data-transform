import gql from "graphql-tag";
import graphqlDataTransform from "../src";

const schema = gql`
  scalar DateTime

  enum TodoStatus {
    PENDING
    IN_PROGRESS
    DONE
  }

  interface Node {
    id: ID!
  }

  type Category implements Node {
    id: ID!
    title: String
    todos: [Todo]
    visible: Boolean
  }

  input CategoryInput {
    title: String
    todoIds: [ID]
    length: Int
  }

  type Todo implements Node {
    id: ID!
    text: String
    status: TodoStatus
    dueDate: DateTime
    estimate: Int
    category: Category
  }

  input TodoInput {
    text: String
    status: TodoStatus
    dueDate: DateTime
    estimate: Int
    categoryId: ID
  }

  type Query {
    node(id: ID!): Node
  }

  input ManyTodos {
    todos: [TodoInput]!
  }
`;

const transforms = {
  Int: {
    format: (value) => String(value),
    parse: (value) => parseInt(value, 10),
  },
  DateTime: {
    data: (value) => new Date(value),
    input: (value) => value.toISOString(),
  },
  TodoStatus: {
    format: (value) => value.toLowerCase(),
    parse: (value) => value.toUpperCase(),
  },
  Todo: {
    format: ({ category, ...value }) => ({
      ...value,
      categoryId: (category || {}).id,
    }),
  },
  Category: {
    format: ({ todos, ...value }) => ({
      ...value,
      todoIds: (todos || []).map(({ id }) => id),
    }),
  },
  CategoryInput: {
    parse: (value) => ({ ...value, length: value.todoIds?.length }),
  },
};

const types = graphqlDataTransform(
  schema,
  transforms,
  ["data", "parse"],
  ["format", "input", "props"]
);

test("unserialize DateTime scalar", () => {
  const date = types.DateTime.data("2012-03-04T05:06:07+0800").get();
  expect(date).toBeInstanceOf(Date);
});

test("serialize DateTime scalar", () => {
  const date = types.DateTime.set(new Date("2012-03-04T05:06:07+0800")).input();
  expect(date).toEqual("2012-03-03T21:06:07.000Z");
});

test("transform Todo data to formData", () => {
  const data = {
    todo: {
      __typename: "Todo",
      id: "Todo:1",
      text: "First todo",
      dueDate: "2012-03-04T05:06:07+0800",
      status: "DONE",
      estimate: 30,
      category: {
        __typename: "Category",
        id: "Category:1",
      },
    },
  };
  const formData = types.Todo.data(data.todo).format();
  const expected = {
    id: "Todo:1",
    text: "First todo",
    dueDate: new Date("2012-03-04T05:06:07+0800"),
    status: "done",
    estimate: "30",
    categoryId: "Category:1",
  };
  expect(formData).toStrictEqual(expected);
});

test("transform Todo formData to input", () => {
  const formData = {
    text: "First todo",
    dueDate: new Date("2012-03-04T05:06:07+0800"),
    status: "done",
    estimate: "30",
    categoryId: "Category:1",
  };
  const attributes = types.TodoInput.parse(formData).input();
  const expected = {
    text: "First todo",
    dueDate: "2012-03-03T21:06:07.000Z",
    status: "DONE",
    estimate: 30,
    categoryId: "Category:1",
  };
  expect(attributes).toStrictEqual(expected);
});

test("transform nested Todo", () => {
  const data = {
    category: {
      __typename: "Category",
      id: "Category:1",
      title: "First category",
      todos: [
        {
          __typename: "Todo",
          id: "Todo:1",
          text: "First todo",
          dueDate: "2012-03-04T05:06:07+0800",
          status: "DONE",
          estimate: 30,
        },
      ],
    },
  };
  const props = types.Category.data(data.category).props();
  const expected = {
    id: "Category:1",
    title: "First category",
    todos: [
      {
        id: "Todo:1",
        text: "First todo",
        dueDate: new Date("2012-03-04T05:06:07+0800"),
        status: "DONE",
        estimate: 30,
      },
    ],
  };
  expect(props).toStrictEqual(expected);
});

test("transform Category data to formData then to input", () => {
  const data = {
    category: {
      __typename: "Category",
      id: "Category:1",
      title: "First category",
      todos: [
        {
          __typename: "Todo",
          id: "Todo:1",
        },
        {
          __typename: "Todo",
          id: "Todo:2",
        },
      ],
    },
  };
  const formData = types.Category.data(data.category).format();
  formData.todoIds = [...formData.todoIds, "Todo:3"];
  const attributes = types.CategoryInput.parse(formData).input();
  const expected = {
    title: "First category",
    todoIds: ["Todo:1", "Todo:2", "Todo:3"],
    length: 3,
  };
  expect(attributes).toStrictEqual(expected);
});

test("transform data with null object", () => {
  const data = {
    todo: {
      __typename: "Todo",
      id: "Todo:1",
      category: null,
    },
  };
  const formData = types.Todo.data(data.todo).format();
  const expected = {
    id: "Todo:1",
    categoryId: undefined,
  };
  expect(formData).toStrictEqual(expected);
});

test("transform query result", () => {
  const data = {
    node: {
      __typename: "Todo",
      id: "Todo:1",
      text: "First todo",
    },
  };
  const formData = types.Query.data(data).format();
  const expected = {
    node: {
      id: "Todo:1",
      text: "First todo",
    },
  };
  expect(formData).toStrictEqual(expected);
});

test("transform list of inputs", () => {
  const formData = {
    todos: [
      {
        text: "First todo",
      },
    ],
  };
  const attributes = types.ManyTodos.parse(formData).input();
  const expected = {
    todos: [
      {
        text: "First todo",
      },
    ],
  };
  expect(attributes).toStrictEqual(expected);
});

test("object transformer function can access original value", () => {
  const transforms = {
    Boolean: {
      getter: (value) => (value ? "Yes" : "No"),
    },
    Category: {
      getter: (value, original) => (original.visible ? value : null),
    },
  };
  const types = graphqlDataTransform(
    schema,
    transforms,
    ["setter"],
    ["getter"]
  );
  const data = [
    {
      category: {
        visible: true,
      },
    },
    {
      category: {
        visible: false,
      },
    },
  ];
  const received = data.map((item) => types.Todo.setter(item).getter());
  const expected = [
    {
      category: {
        visible: "Yes",
      },
    },
    { category: null },
  ];
  expect(received).toStrictEqual(expected);
});

describe("Double transform bug", () => {
  const schema = gql`
    scalar Counter
    type CounterObject {
      count: Counter
      counts: [Counter]
    }
  `;
  const transforms = {
    Counter: {
      parse: (value) => value + 1,
    },
  };
  const types = graphqlDataTransform(schema, transforms, ["parse"], []);
  test("Scalar setters are called only once", () => {
    const count = types.Counter.parse(0).get();
    expect(count).toBe(1);
  });
  test("Object setters are called only once", () => {
    const { count } = types.CounterObject.parse({ count: 0 }).get();
    expect(count).toBe(1);
  });
  test("List setters are called only once", () => {
    const {
      counts: [count],
    } = types.CounterObject.parse({ counts: [0] }).get();
    expect(count).toBe(1);
  });
});
