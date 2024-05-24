
import { Cursor, RemoteInsertion, RemoteDeletion, TextNode, LocalOperation, DeliveredOperation } from './types.mjs';

export class LocalCursor implements Cursor {
  private position: TextNode;
  private applyOperation: (operation: LocalOperation) => DeliveredOperation
  constructor({ document, applyOperation }: { document: TextNode, applyOperation: (operation: LocalOperation) => DeliveredOperation }) {
    this.position = document;
    this.applyOperation = applyOperation;
  }

  private locate = (offset: number): TextNode => {
    let iter = this.position;
    while (offset != 0) {
      if (offset > 0) {
        if (iter.next == undefined) return iter;
        iter = iter.next;
        if (iter.isDeleted) continue;
        offset--;
      } else {
        if (iter.prev == undefined) return iter;
        iter = iter.prev;
        if (iter.isDeleted) continue;
        offset++;
      }
    }

    return iter;
  }

  public insert(value: string): RemoteInsertion {
    const operation = this.applyOperation({
      type: 'insert',
      value,
      insertAfter: this.position.anchor,
    })


    if (operation == undefined) {
      console.log('Assertion failed: operation should not be undefined');
      process.exit(1);
    }

    this.move(1);
    return operation as RemoteInsertion;
  }
  public delete(count: number): RemoteDeletion {
    let begin = this.position;
    let end = this.locate(count - 1);
    if (begin.__isVirtual && begin.next != undefined) {
      begin = this.locate(1);
    }
    if (end.__isVirtual && end.next != undefined) {
      end = this.locate(1);
    }

    const operation = this.applyOperation({
      type: 'delete',
      between: {
        begin: this.position.anchor,
        end: end.anchor
      }
    })

    if (operation == undefined) {
      console.log('Assertion failed: operation should not be undefined');
      process.exit(1);
    }

    return operation as RemoteDeletion;

  }
  public move(offset: number): Cursor {
    this.position = this.locate(offset);
    return this;
  }
}