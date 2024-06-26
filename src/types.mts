export type DeliveredOperation = RemoteInsertion | RemoteDeletion;
export type LocalOperation = LocalInsertion | LocalDeletion;

export interface RemoteDeletion {
  type: 'delete';

  between: { begin: TextAnchor; end: TextAnchor; };

  version: VersionVector;
}
export interface LocalDeletion {
  type: 'delete';

  between: { begin: TextAnchor; end: TextAnchor; };
}

export interface RemoteInsertion {
  type: 'insert';
  value: string;

  insertAfter: TextAnchor;
  inserted: TextAnchor;
}
export interface LocalInsertion {
  type: 'insert';
  value: string;

  insertAfter: TextAnchor;
}

export type Document = TextNode;
export interface TextNode {
  __isVirtual?: boolean;
  isDeleted?: boolean;

  value: string;
  anchor: TextAnchor;

  next?: TextNode;
  prev?: TextNode;
}

export interface ReplicaVersion {
  replicaId: string;
  lamport: number;
}
export interface TextAnchor extends ReplicaVersion {
  n: number;
}

export interface VersionVector {
  [replicaId: string]: number;
}

export interface Cursor {
  insert(value: string): RemoteInsertion;
  delete(count: number): RemoteDeletion;

  move(offset: number): Cursor;
}
