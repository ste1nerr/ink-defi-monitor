/** The request is valid HTTP but asks for something the data source cannot answer (→ 400). */
export class QueryError extends Error {}

/** A feature needs an indexer that is not configured in this deployment (→ 503). */
export class IndexerNotConfiguredError extends Error {}
