// import process
import process from 'node:process';
import { RemoteInsertion, RemoteDeletion, Document, DeliveredOperation, TextNode, ReplicaVersion, TextAnchor, LocalOperation, LocalInsertion, LocalDeletion } from './types.mjs';

interface Cursor {
  insert(value: string): RemoteInsertion;
  delete(count: number): RemoteDeletion;

  move(offset: number): Cursor;
}

export class CrdtReplica {
  private id: string;
  private lamport: number;
  private textCounter: number;
  private document: Document;
  private blockedOperations: DeliveredOperation[];

  constructor({ id, stateZero }: { id?: string, stateZero?: TextNode }) {
    this.id = id ?? Math.random().toString(36).slice(2);
    this.lamport = 0;
    this.textCounter = 0;
    this.document = stateZero ?? { __isVirtual: true, value: '', anchor: { replicaId: 'root', lamport: -1, n: -1 } };
    this.blockedOperations = [];
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


    while (this.versionGt(iterNext.anchor, target)) {
      if (iterNext.next == undefined) {
        return iterNext;
      }
      iter = iterNext;
      iterNext = iterNext.next;
    }

    return iter;
  }

  private versionGt(a: ReplicaVersion, b: ReplicaVersion): boolean {
    return a.lamport === b.lamport
      ? a.replicaId < b.replicaId // dictionary order
      : a.lamport > b.lamport
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
        version: {
          replicaId: this.id,
          lamport: this.lamport
        }
      }
    }

    console.log('Assertion failed: operation should be insert or delete');
    process.exit(1);
  }


  private applyLocalInsertion(insertion: LocalInsertion): TextAnchor {
    const newAnchor = {
      replicaId: this.id,
      n: ++this.textCounter,
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

  }

  private tryApplyBlocked(): void {
    for (const blockedOperation of this.blockedOperations) {
      if (this.checkState(blockedOperation)) {
      }
    }
  }

  private checkState(operation: DeliveredOperation): boolean {
    if (operation.type === 'insert') {
      if (operation.inserted.lamport - 1 > this.lamport) {
        return false;
      }

      const textNode = this.findAnchorEq(operation.insertAfter);
      if (textNode == undefined) {
        return false;
      }
    }

    if (operation.type === 'delete') {
      if (operation.version.lamport - 1 > this.lamport) {
        return false;
      }

      const localBegin = this.findAnchorEq(operation.between.begin);
      const localEnd = this.findAnchorEq(operation.between.end);

      if (localBegin == undefined || localEnd == undefined) {
        return false;
      }
    }

    return true;
  }

  findAnchorEq(insertAfter: TextAnchor): TextNode | undefined {
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
      return segment.value;
    }

    return segment.value + this.toString(segment.next);
  }

  public cursor(): Cursor {
    let position: TextNode = this.document;

    const search = (offset: number): TextNode => {
      let iter = position;
      while (offset != 0) {
        if (offset > 0) {
          if (iter.next == undefined) return iter;
          iter = iter.next;
          offset--;
        } else {
          if (iter.prev == undefined) return iter;
          iter = iter.prev;
          offset++;
        }
      }

      return iter;
    }

    const cursorSelf = {
      insert: (value: string): RemoteInsertion => {
        const operation = this.applyLocal({
          type: 'insert',
          value,
          insertAfter: position.anchor,
        })


        if (operation == undefined) {
          console.log('Assertion failed: operation should not be undefined');
          process.exit(1);
        }

        cursorSelf.move(1);
        return operation as RemoteInsertion;
      },
      delete: (count: number): RemoteDeletion => {
        const end = search(count);
        const operation = this.applyLocal({
          type: 'delete',
          between: {
            begin: position.anchor,
            end: end.anchor
          }
        })

        if (operation == undefined) {
          console.log('Assertion failed: operation should not be undefined');
          process.exit(1);
        }

        return operation as RemoteDeletion;

      },
      move: (offset: number): Cursor => {
        position = search(offset);
        return cursorSelf;
      }
    }

    return cursorSelf;
  }

}