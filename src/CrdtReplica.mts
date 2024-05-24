
import process from 'node:process';
import { RemoteInsertion, RemoteDeletion, Document, DeliveredOperation, TextNode, ReplicaVersion, TextAnchor, LocalOperation, LocalInsertion, LocalDeletion, VersionVector, Cursor } from './types.mjs';
import { LocalCursor } from './LocalCursor.mjs'; 

export class CrdtReplica {
  private id: string;
  private lamport: number;
  private textCounter: number;
  private document: Document;
  private blockedOperations: DeliveredOperation[];
  private versionVector: VersionVector;

  constructor({ id, stateZero }: { id?: string, stateZero?: TextNode }) {
    this.id = id ?? Math.random().toString(36).slice(2);
    this.lamport = 0;
    this.textCounter = 0;
    this.document = stateZero ?? { __isVirtual: true, value: '', anchor: { replicaId: 'root', lamport: -1, n: -1 } };
    this.blockedOperations = [];
    this.versionVector = { [this.id]: -1 };
  }

  public applyRemote(operation: DeliveredOperation): undefined {
    if (!this.checkState(operation)) {
      this.blockedOperations.push(operation);
      return undefined;
    }

    if (operation.type === 'insert') this.applyRemoteInsertion(operation);
    if (operation.type === 'delete') this.applyRemoteDeletion(operation);

    this.tryApplyBlocked();
  }

  private applyRemoteInsertion(insertion: RemoteInsertion): void {
    this.versionVector[insertion.inserted.replicaId] = insertion.inserted.n;
    const newNode: TextNode = {
      value: insertion.value,
      anchor: insertion.inserted,
    }
    this.lamport = Math.max(this.lamport, insertion.inserted.lamport) + 1;

    const insertPosition = this.findRightFirstLte(insertion.inserted, insertion.insertAfter);
    if (insertPosition == undefined) {
      console.log('Assertion failed: remote insert position should not be undefined');
      process.exit(1);
    }

    newNode.next = insertPosition.next;
    newNode.prev = insertPosition;
    insertPosition.next = newNode;
    if (newNode.next != undefined) {
      newNode.next.prev = newNode;
    }
  }

  private applyRemoteDeletion(deletion: RemoteDeletion): void {
    let end = this.findAnchorEq(deletion.between.end);
    for (
      let iter = this.findAnchorEq(deletion.between.begin);
      iter != undefined && iter !== end;
      iter = iter.next
    ) {
      const peerVersion = deletion.version[iter.anchor.replicaId];
      if (iter.anchor.n > peerVersion) continue;

      iter.isDeleted = true;
    }

    if (end != undefined) {
      if (end.anchor.n > deletion.version[end.anchor.replicaId]) return;
      end.isDeleted = true;
    }
  }

  private applyLocal(operation: LocalOperation): DeliveredOperation {
    if (operation.type === 'insert') {
      return {
        ...operation,
        inserted: this.applyLocalInsertion(operation)
      }
    }

    if (operation.type === 'delete') {
      this.applyLocalDeletion(operation);
      return {
        ...operation,
        version: this.versionVector
      }
    }

    console.log('Assertion failed: operation should be insert or delete');
    process.exit(1);
  }


  private applyLocalInsertion(insertion: LocalInsertion): TextAnchor {
    this.versionVector[this.id] = ++this.textCounter;
    const newAnchor = {
      replicaId: this.id,
      n: this.versionVector[this.id],
      lamport: this.lamport++
    };

    const newNode: TextNode = {
      value: insertion.value,
      anchor: newAnchor
    }

    const insertPosition = this.findAnchorEq(insertion.insertAfter);
    if (insertPosition == undefined) {
      console.log('Assertion failed: local insert position should not be undefined');
      process.exit(1);
    }

    newNode.next = insertPosition.next;
    newNode.prev = insertPosition;
    insertPosition.next = newNode;
    if (newNode.next != undefined) {
      newNode.next.prev = newNode;
    }

    return newAnchor;
  }



  private applyLocalDeletion(deletion: LocalDeletion) {
    let end = this.findAnchorEq(deletion.between.end);
    for (
      let iter = this.findAnchorEq(deletion.between.begin);
      iter != undefined && iter !== end;
      iter = iter.next
    ) {
      iter.isDeleted = true;
    }

    if (end != undefined) {
      end.isDeleted = true;
    }
  }

  private tryApplyBlocked(): void {
    const willApply: DeliveredOperation[] = this.blockedOperations.filter(this.checkState.bind(this));
    this.blockedOperations = this.blockedOperations.filter((operation) => !this.checkState(operation));
    willApply.forEach(this.applyRemote.bind(this));
  }

  private checkState(operation: DeliveredOperation): boolean {
    if (operation.type === 'delete') {
      if (this.vectorGte(this.versionVector, operation.version)) {
        return true;
      }
      return false;
    }

    return true;
  }

  private findRightFirstLte(
    target: ReplicaVersion,
    startAnchor: TextAnchor,
  ): TextNode | undefined {
    let iter = this.findAnchorEq(startAnchor);
    let iterNext = iter?.next;
    if (iter === undefined) {
      return undefined;
    }

    if (iterNext == undefined) {
      return iter;
    }


    while (this.orderGt(iterNext.anchor, target)) {
      if (iterNext.next == undefined) {
        return iterNext;
      }
      iter = iterNext;
      iterNext = iterNext.next;
    }

    return iter;
  }

  private orderGt(a: ReplicaVersion, b: ReplicaVersion): boolean {
    return a.lamport === b.lamport
      ? a.replicaId < b.replicaId // dictionary order
      : a.lamport > b.lamport
  }

  private vectorGte(a: VersionVector, b: VersionVector): boolean {
    return Object.entries(b).filter(([, n]) => n != -1).every(([replicaId, n]) => {
      return a[replicaId] != undefined && a[replicaId] >= n;
    });
  }

  private findAnchorEq(insertAfter?: TextAnchor): TextNode | undefined {
    if (insertAfter == undefined) return undefined;

    for (
      let iter: TextNode | undefined = this.document;
      iter != undefined;
      iter = iter.next
    ) {
      if ((iter.anchor.replicaId === insertAfter.replicaId || iter.__isVirtual) && iter.anchor.n === insertAfter.n) {
        return iter;
      }
    }

    return undefined;
  }

  public toString(segment?: TextNode): string {
    if (segment == undefined) {
      segment = this.document;
    }

    if (segment.next == undefined) {
      return segment.isDeleted ? '' : segment.value;
    }

    return (segment.isDeleted ? '' : segment.value) + this.toString(segment.next);
  }

  public localCursor(): Cursor {
    return new LocalCursor({
      applyOperation: this.applyLocal.bind(this),
      document: this.document
    })
  }
}
