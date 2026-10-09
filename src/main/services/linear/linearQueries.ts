/**
 * GraphQL documents for Linear's API (https://api.linear.app/graphql). Page sizes are explicit
 * because Linear charges query complexity per requested node (default page size 50).
 */

/** Labels read per issue; more than this is rare and only hides labels on the card. */
const ISSUE_FIELDS = `
  id
  identifier
  number
  title
  description
  url
  priority
  updatedAt
  creator { name }
  state { name type }
  labels(first: 20) { nodes { id name } }
`

export const VIEWER_QUERY = `
  query DugoutViewer {
    viewer { name organization { name } }
  }
`

export const TEAMS_QUERY = `
  query DugoutTeams {
    teams(first: 100) { nodes { key name } }
  }
`

export const TEAM_QUERY = `
  query DugoutTeam($key: String!) {
    teams(first: 1, filter: { key: { eq: $key } }) {
      nodes { id key states(first: 50) { nodes { id name type position } } }
    }
  }
`

export const ISSUES_QUERY = `
  query DugoutIssues($key: String!, $first: Int!, $after: String) {
    issues(
      first: $first
      after: $after
      orderBy: updatedAt
      filter: { team: { key: { eq: $key } } }
    ) {
      nodes { ${ISSUE_FIELDS} }
      pageInfo { hasNextPage endCursor }
    }
  }
`

export const ISSUE_QUERY = `
  query DugoutIssue($id: String!) {
    issue(id: $id) {
      ${ISSUE_FIELDS}
      comments(first: 100) { nodes { body createdAt user { name } } }
    }
  }
`

export const LABELS_QUERY = `
  query DugoutLabels($names: [String!]!) {
    issueLabels(first: 50, filter: { name: { in: $names } }) {
      nodes { id name team { id } }
    }
  }
`

export const CREATE_LABEL_MUTATION = `
  mutation DugoutCreateLabel($input: IssueLabelCreateInput!) {
    issueLabelCreate(input: $input) { success issueLabel { id name } }
  }
`

export const CREATE_ISSUE_MUTATION = `
  mutation DugoutCreateIssue($input: IssueCreateInput!) {
    issueCreate(input: $input) { success issue { ${ISSUE_FIELDS} } }
  }
`

export const UPDATE_ISSUE_MUTATION = `
  mutation DugoutUpdateIssue($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) { success issue { ${ISSUE_FIELDS} } }
  }
`

export const CREATE_COMMENT_MUTATION = `
  mutation DugoutComment($input: CommentCreateInput!) {
    commentCreate(input: $input) { success }
  }
`
