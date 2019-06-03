import gql from "graphql-tag";
import graphqlDataTransform from "../src";

const schema = gql`
  scalar DateTime

  enum TodoStatus {
    PENDING
    IN_PROGRESS
    DONE
  }

  type Category {
    id: ID!
    title: String
    todos: [Todo]
  }

  input CategoryInput {
    title: String
    todoIds: [ID]
  }

  type Todo {
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
`;

const transforms = {
  Int: {
    format: value => String(value),
    parse: value => parseInt(value, 10)
  },
  DateTime: {
    data: value => new Date(value),
    input: value => value.toISOString()
  },
  TodoStatus: {
    format: value => value.toLowerCase(),
    parse: value => value.toUpperCase()
  },
  Todo: {
    format: value => ({ ...value, categoryId: (value.category || {}).id })
  },
  Category: {
    format: value => ({
      ...value,
      todoIds: (value.todos || []).map(({ id }) => id)
    })
  }
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
        id: "Category:1"
      }
    }
  };
  const formData = types.Todo.data(data.todo).format();
  const expected = {
    text: "First todo",
    dueDate: new Date("2012-03-04T05:06:07+0800"),
    status: "done",
    estimate: "30",
    categoryId: "Category:1"
  };
  expect(formData).toMatchObject(expected);
});

test("transform Todo formData to input", () => {
  const formData = {
    text: "First todo",
    dueDate: new Date("2012-03-04T05:06:07+0800"),
    status: "done",
    estimate: "30",
    categoryId: "Category:1"
  };
  const attributes = types.TodoInput.parse(formData).input();
  const expected = {
    text: "First todo",
    dueDate: "2012-03-03T21:06:07.000Z",
    status: "DONE",
    estimate: 30,
    categoryId: "Category:1"
  };
  expect(attributes).toMatchObject(expected);
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
          estimate: 30
        }
      ]
    }
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
        estimate: 30
      }
    ]
  };
  expect(props).toMatchObject(expected);
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
          id: "Todo:1"
        },
        {
          __typename: "Todo",
          id: "Todo:2"
        }
      ]
    }
  };
  const formData = types.Category.data(data.category).format();
  formData.todoIds = [...formData.todoIds, "Todo:3"];
  const attributes = types.CategoryInput.parse(formData).input();
  const expected = {
    title: "First category",
    todoIds: ["Todo:1", "Todo:2", "Todo:3"]
  };
  expect(attributes).toMatchObject(expected);
});

test("transform data with null object", () => {
  const data = {
    todo: {
      __typename: "Todo",
      id: "Todo:1",
      category: null
    }
  }
  const formData = types.Todo.data(data.todo).format();
  const expected = {
    id: "Todo:1"
  }
  expect(formData).toMatchObject(expected)
})
