import { CrdtReplica } from "./src/index.mjs";

// test
const assert = (condition: boolean, message: string) => {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

const cases: { run: () => void }[] = [
  { run: shouldInsertAndMoveOnSingleNode },
  { run: cursorShouldConstructOpForPeer },
  { run: shouldConsistentlyInsertOnTwoReplicas },
  { run: shouldConsistentlyInsertOnThreeReplicas }
]

function shouldInsertAndMoveOnSingleNode() {
  const peer1 = new CrdtReplica({ id: 'peer1' });

  const cursor1 = peer1.cursor();

  cursor1.insert('H');
  cursor1.insert('l');
  cursor1.insert('l');
  cursor1.move(-2);
  cursor1.insert('e');
  cursor1.move(2);
  cursor1.insert('o');

  cursor1.insert(' ');
  cursor1.insert('o');
  cursor1.insert('!');
  cursor1.move(-1);
  cursor1.insert('r');
  cursor1.insert('l');
  cursor1.insert('d');
  cursor1.move(-4);
  cursor1.insert('W');

  const result = peer1.toString()

  assert(result === 'Hello World!', `shouldInsertAndMoveOnSingleNode failed: expected 'Hello World!', got '${result}'`);
}

function cursorShouldConstructOpForPeer() {
  const peer1 = new CrdtReplica({ id: 'peer1' });
  const cursor1 = peer1.cursor();

  const IHOp = cursor1.insert('H');
  assert(IHOp.value === 'H', `cursorShouldConstructOpForPeer failed: insert value, expected 'H', got '${IHOp.value}'`);
  assert(IHOp.insertAfter.lamport === -1,
    `cursorShouldConstructOpForPeer failed: insert after, excpected -1, got ${IHOp.insertAfter.lamport}`);
  assert(IHOp.inserted.lamport === 0,
    `cursorShouldConstructOpForPeer failed: first insertion version, expected 0, got ${IHOp.inserted.lamport}`);
  assert((peer1 as any).lamport === 1,
    `cursorShouldConstructOpForPeer failed: replica lamport, expected 1, got ${(peer1 as any).lamport}`);

}

// two replicas 
function shouldConsistentlyInsertOnTwoReplicas() {
  const peer1 = new CrdtReplica({ id: 'peer1' });
  const peer2 = new CrdtReplica({ id: 'peer2' });

  const cursor1 = peer1.cursor();
  const cursor2 = peer2.cursor();

  const peer1Op1 = cursor1.insert('A');
  const peer2Op1 = cursor2.insert('C');

  // sync
  peer2.applyRemote(peer1Op1);
  peer1.applyRemote(peer2Op1);

  cursor2.move(-1);
  const peer2Op2 = cursor2.insert('B');

  // sync
  peer1.applyRemote(peer2Op2);

  assert(peer1.toString() === peer2.toString(), `shouldConsistentlyInsertOnTwoReplicas failed: expected 'ABC', got ${peer1.toString()}`);
}

// three replicas
// peer1: H e
// peer2: l l o <space>
// peer1 -> peer2 H e
// peer2 -> peer1 l l o
// peer3: W o r l d !
// peer3 -> peer1 W o r l d !
// peer3 -> peer2 W o r l d !
// peer1 -> peer3 H e
// peer2 -> peer3 l l o
// peer2 -> peer1 <space>
// peer2 -> peer3 <space>
// result: "Hello World!"
function shouldConsistentlyInsertOnThreeReplicas() {
  const peer1 = new CrdtReplica({ id: 'peer1' });
  const peer2 = new CrdtReplica({ id: 'peer2' });

  const peer1Ops = []
  const peer2Ops = []

  const cursor1 = peer1.cursor();
  const cursor2 = peer2.cursor();

  // peer1: H e
  peer1Ops.push(cursor1.insert('H'));
  peer1Ops.push(cursor1.insert('e'));

  // peer2: l l o <space>
  peer2Ops.push(cursor2.insert('l'));
  peer2Ops.push(cursor2.insert('l'));
  peer2Ops.push(cursor2.insert('o'));
  peer2Ops.push(cursor2.insert(' ')); // broadcast at last

  // peer1 -> peer2 H e
  peer2.applyRemote(peer1Ops[0]);
  peer2.applyRemote(peer1Ops[1]);

  // peer2 -> peer1 l l o
  peer1.applyRemote(peer2Ops[0]);
  peer1.applyRemote(peer2Ops[1]);
  peer1.applyRemote(peer2Ops[2]);

  assert(peer1.toString() === 'Hello', `shouldConsistentlyInsertOnThreeReplicas failed: expected 'Hello', got ${peer1.toString()}`);
  assert(peer2.toString() === 'Hello ', `shouldConsistentlyInsertOnThreeReplicas failed: expected 'Hello ', got ${peer2.toString()}`);

  const peer3 = new CrdtReplica({ id: 'peer3' });
  const peer3Ops = [];
  const cursor3 = peer3.cursor();

  // peer3: W o r l d !
  peer3Ops.push(cursor3.insert('W'));
  peer3Ops.push(cursor3.insert('o'));
  peer3Ops.push(cursor3.insert('r'));
  peer3Ops.push(cursor3.insert('l'));
  peer3Ops.push(cursor3.insert('d'));
  peer3Ops.push(cursor3.insert('!'));

  // peer3 -> peer1 W o r l d !
  peer1.applyRemote(peer3Ops[0]);
  peer1.applyRemote(peer3Ops[1]);
  peer1.applyRemote(peer3Ops[2]);
  peer1.applyRemote(peer3Ops[3]);
  peer1.applyRemote(peer3Ops[4]);
  peer1.applyRemote(peer3Ops[5]);

  // peer3 -> peer2 W o r l d !
  peer2.applyRemote(peer3Ops[0]);
  peer2.applyRemote(peer3Ops[1]);
  peer2.applyRemote(peer3Ops[2]);
  peer2.applyRemote(peer3Ops[3]);
  peer2.applyRemote(peer3Ops[4]);
  peer2.applyRemote(peer3Ops[5]);

  assert(peer1.toString() === 'HelloWorld!', `shouldConsistentlyInsertOnThreeReplicas failed: expected 'HelloWorld!', got ${peer1.toString()}`);
  assert(peer2.toString() === 'Hello World!', `shouldConsistentlyInsertOnThreeReplicas failed: expected 'Hello World!', got ${peer2.toString()}`);
  assert(peer3.toString() === 'World!', `shouldConsistentlyInsertOnThreeReplicas failed: expected 'World!', got ${peer3.toString()}`);

  // peer1 -> peer3 H e
  peer3.applyRemote(peer1Ops[0]);
  peer3.applyRemote(peer1Ops[1]);

  // peer2 -> peer3 l l o
  peer3.applyRemote(peer2Ops[0]);
  peer3.applyRemote(peer2Ops[1]);
  peer3.applyRemote(peer2Ops[2]);

  // peer2 -> peer1 <space>
  peer1.applyRemote(peer2Ops[3]);

  // peer2 -> peer3 <space>
  peer3.applyRemote(peer2Ops[3]);

  assert(peer1.toString() === 'Hello World!', `shouldConsistentlyInsertOnThreeReplicas failed: expected 'Hello World!', got ${peer1.toString()}`);
  assert(peer2.toString() === 'Hello World!', `shouldConsistentlyInsertOnThreeReplicas failed: expected 'Hello World!', got ${peer2.toString()}`);
  assert(peer3.toString() === 'Hello World!', `shouldConsistentlyInsertOnThreeReplicas failed: expected 'Hello World!', got ${peer3.toString()}`);
}

function getFunName(fun: () => void): string {
  return fun.toString().split(' ')[1];
}

for (const c of cases) {
  const caseName = getFunName(c.run);

  c.run()

  console.log(`✅ Case ${caseName} passed`);
}
