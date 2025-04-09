const express = require('express');
const { graphqlHTTP } = require('express-graphql');
const { buildSchema } = require('graphql');
const cors = require('cors');
const mongoose=require('mongoose');
const { configDotenv } = require('dotenv');
require('dotenv').config();
const app = express();
app.use(cors());
app.use(express.json());
mongoose.connect(process.env.MONGO_DB)
  .then(() => console.log("MongoDB connected successfully"))
  .catch(err => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });
// Sample data storage
let issues = [];
const issueSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ['open', 'closed', 'in_progress', 'hold'],
        default: 'open'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    assignedTo: {
        type: String,
        required: true,
    },
    tags: [{
        type: String
    }],
    dueDate: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    comments: [{
        text: {
            type: String,
            required: true,
            default: ''
        },
        author: {
            type: String,
            required: true,
            default: 'Anonymous'
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }]
});

// Add middleware to ensure non-null values before saving
issueSchema.pre('save', function(next) {
    // Ensure comments have non-null values
    if (this.comments) {
        this.comments = this.comments.map(comment => ({
            ...comment,
            text: comment.text || '',
            author: comment.author || 'Anonymous',
            createdAt: comment.createdAt || new Date()
        }));
    }
    next();
});

const Issue = mongoose.model('Issue', issueSchema);

// GraphQL Schema
const schema = buildSchema(`
  scalar Date

  type Comment {
    id: ID!
    text: String!
    author: String!
    createdAt: Date!
  }

  type Issue {
    id: ID!
    title: String!
    description: String!
    status: String!
    priority: String!
    assignedTo: String!
    tags: [String]
    dueDate: Date
    createdAt: Date!
    updatedAt: Date!
    comments: [Comment!]!
  }

  type Query {
    issues: [Issue]
    issue(id: ID!): Issue
    dashboardStats: DashboardStats
  }

  type DashboardStats {
    totalIssues: Int!
    openIssues: Int!
    closedIssues: Int!
    inProgressIssues: Int!
    holdIssues: Int!
    highPriorityIssues: Int!
    mediumPriorityIssues: Int!
    lowPriorityIssues: Int!
  }

  type Mutation {
    addIssue(
      title: String!
      description: String!
      status: String!
      priority: String!
      assignedTo: String!
      tags: [String]
      dueDate: String
    ): Issue
    updateIssue(
      id: ID!
      title: String
      description: String
      status: String
      priority: String
      assignedTo: String
      tags: [String]
      dueDate: String
    ): Issue
    deleteIssue(id: ID!): Boolean
    addComment(issueId: ID!, text: String!, author: String!): Issue
  }
`);

// GraphQL Resolvers
const root = {
  Date: {
    serialize(value) {
      return value ? value.toISOString() : null;
    },
    parseValue(value) {
      return value ? new Date(value) : null;
    },
    parseLiteral(ast) {
      return ast.value ? new Date(ast.value) : null;
    }
  },
  issues: async () => {
    const issues = await Issue.find({});
    return issues.map(issue => ({
      ...issue.toObject(),
      id: issue._id.toString(),
      createdAt: issue.createdAt.toISOString(),
      updatedAt: issue.updatedAt.toISOString(),
      dueDate: issue.dueDate ? issue.dueDate.toISOString() : null,
      comments: issue.comments.map(comment => ({
        id: comment._id.toString(),
        text: comment.text || '',
        author: comment.author || 'Anonymous',
        createdAt: comment.createdAt ? comment.createdAt.toISOString() : new Date().toISOString()
      }))
    }));
  },
  issue: async ({ id }) => {
    const issue = await Issue.findById(id);
    if (!issue) return null;
    
    return {
      ...issue.toObject(),
      id: issue._id.toString(),
      createdAt: issue.createdAt.toISOString(),
      updatedAt: issue.updatedAt.toISOString(),
      dueDate: issue.dueDate ? issue.dueDate.toISOString() : null,
      comments: issue.comments.map(comment => ({
        id: comment._id.toString(),
        text: comment.text || '',
        author: comment.author || 'Anonymous',
        createdAt: comment.createdAt ? comment.createdAt.toISOString() : new Date().toISOString()
      }))
    };
  },
  dashboardStats: async () => {
    const totalIssues = await Issue.countDocuments();
    const openIssues = await Issue.countDocuments({ status: 'open' });
    const closedIssues = await Issue.countDocuments({ status: 'closed' });
    const inProgressIssues = await Issue.countDocuments({ status: 'in_progress' });
    const holdIssues = await Issue.countDocuments({ status: 'hold' });
    const highPriorityIssues = await Issue.countDocuments({ priority: 'high' });
    const mediumPriorityIssues = await Issue.countDocuments({ priority: 'medium' });
    const lowPriorityIssues = await Issue.countDocuments({ priority: 'low' });

    return {
      totalIssues,
      openIssues,
      closedIssues,
      inProgressIssues,
      holdIssues,
      highPriorityIssues,
      mediumPriorityIssues,
      lowPriorityIssues
    };
  },
  addIssue: async (args) => {
    try {
      const issue = new Issue(args);
      const savedIssue = await issue.save();
      return savedIssue;
    } catch (error) {
      console.error("Error adding issue:", error);
      throw new Error(`Failed to add issue: ${error.message}`);
    }
  },
  updateIssue: async ({ id, ...args }) => {
    return await Issue.findByIdAndUpdate(id, args, { new: true });
  },
  deleteIssue: async ({ id }) => {
    await Issue.findByIdAndDelete(id);
    return true;
  },
  addComment: async ({ issueId, text, author }) => {
    try {
      const issue = await Issue.findById(issueId);
      if (!issue) throw new Error('Issue not found');
      
      if (!text?.trim()) {
        throw new Error('Comment text is required');
      }
      if (!author?.trim()) {
        throw new Error('Author name is required');
      }

      const newComment = {
        text: text.trim(),
        author: author.trim(),
        createdAt: new Date()
      };
      
      issue.comments.push(newComment);
      const updatedIssue = await issue.save();
      
      return {
        ...updatedIssue.toObject(),
        id: updatedIssue._id.toString(),
        createdAt: updatedIssue.createdAt.toISOString(),
        updatedAt: updatedIssue.updatedAt.toISOString(),
        dueDate: updatedIssue.dueDate ? updatedIssue.dueDate.toISOString() : null,
        comments: updatedIssue.comments.map(comment => ({
          id: comment._id.toString(),
          text: comment.text || '',
          author: comment.author || 'Anonymous',
          createdAt: comment.createdAt ? comment.createdAt.toISOString() : new Date().toISOString()
        }))
      };
    } catch (error) {
      console.error('Error adding comment:', error);
      throw new Error(`Failed to add comment: ${error.message}`);
    }
  }
};

// GraphQL Endpoint
app.use('/graphql', graphqlHTTP({
  schema,
  rootValue: root,
  graphiql: true,
  customFormatErrorFn: (error) => {
    console.error('GraphQL Error:', error);
    return {
      message: error.message,
      locations: error.locations,
      path: error.path,
      extensions: error.extensions,
    };
  },
}));


// Start Server
app.listen(3500, () => {
  console.log('GraphQL server running on http://localhost:3500/graphql');
});
