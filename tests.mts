import { CrdtReplica } from "./src/index.mjs";

// test
const assert = (condition: boolean, message: string) => {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

const cases: { run: () => void }[] = [
  { run: testSingleReplicaInsertAndMove },
  { run: testCursorConstructsOperationForPeer },
  { run: testConsistentInsertionOnTwoReplicas },
  { run: testConsistentInsertionOnThreeReplicas },
  { run: testLocalDeletion },
  { run: testIgnoringDeletionOfUnawareText },
  { run: testAwaitingDeletionIfVersionVectorIsLessThanPeer },
]

function testSingleReplicaInsertAndMove() {
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

function testCursorConstructsOperationForPeer() {
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
function testConsistentInsertionOnTwoReplicas() {
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
function testConsistentInsertionOnThreeReplicas() {
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

function testLocalDeletion() {
  const peer = new CrdtReplica({ id: 'peer' });
  const cursor = peer.cursor();
  
  cursor.insert('H');
  cursor.insert('e');
  cursor.insert('l');
  cursor.insert('l');
  cursor.insert('o');
  
  cursor.delete(1);

  assert(peer.toString() === 'Hell', `shouldDeleteLocalText failed: remove 'o', expected 'Hell', got ${peer.toString()}`);
  
  cursor.move(-4);
  cursor.delete(1);
  
  assert(peer.toString() === 'ell', `shouldDeleteLocalText failed: remove 'H', expected 'ell', got ${peer.toString()}`);
  
  cursor.move(-10);
  cursor.delete(1);
  
  assert(peer.toString() === 'll', `shouldDeleteLocalText failed: remove 'e', expected 'll', got ${peer.toString()}`);
  
  cursor.delete(10);;
  
  assert(peer.toString() === '', `shouldDeleteLocalText failed: remove 'll', expected '', got ${peer.toString()}`);
}

// peer1: H e l l o <space>
// peer2: W o r l d !
// peer1 -> peer2 H e l l o <space>
// peer2 -> peer1 W o r l d !
// peer1 -> peer3 H e l
// peer2 -> peer3 W o r
// peer3: delete e to o (H e l W o r)
//                         ^ ^ ^ ^
// peer3 -> peer1 delete e to o
// peer3 -> peer2 delete e to o
// peer1 -> peer3 l o <space>
// peer2 -> peer3 l d !
// result: "Hlo rld!"
function testIgnoringDeletionOfUnawareText() {
  const peer1 = new CrdtReplica({ id: 'peer1' });
  const peer2 = new CrdtReplica({ id: 'peer2' });
  const peer3 = new CrdtReplica({ id: 'peer3' });
  
  const peer1Ops = []
  const peer2Ops = []
  const peer3Ops = []

  const cursor1 = peer1.cursor();
  const cursor2 = peer2.cursor();
  const cursor3 = peer3.cursor();
  
  // peer1: H e l l o <space>
  peer1Ops.push(cursor1.insert('H'));
  peer1Ops.push(cursor1.insert('e'));
  peer1Ops.push(cursor1.insert('l'));
  peer1Ops.push(cursor1.insert('l'));
  peer1Ops.push(cursor1.insert('o'));
  peer1Ops.push(cursor1.insert(' '));
  
  // peer2: W o r l d !
  peer2Ops.push(cursor2.insert('W'));
  peer2Ops.push(cursor2.insert('o'));
  peer2Ops.push(cursor2.insert('r'));
  peer2Ops.push(cursor2.insert('l'));
  peer2Ops.push(cursor2.insert('d'));
  peer2Ops.push(cursor2.insert('!'));
  
  // peer1 -> peer2 H e l l o <space>
  peer1Ops.forEach(op => peer2.applyRemote(op));
  // peer2 -> peer1 W o r l d !
  peer2Ops.forEach(op => peer1.applyRemote(op));
  
  // peer1 -> peer3 H e l
  peer1Ops.slice(0, 3).forEach(op => peer3.applyRemote(op));
  
  // peer2 -> peer3 W o r
  peer2Ops.slice(0, 3).forEach(op => peer3.applyRemote(op));

  // peer3: delete e to o (H e l W o r)
  //                         ^ ^ ^ ^
  cursor3.move(2)
  peer3Ops.push(cursor3.delete(4));

  // peer3 -> peer1 delete e to o
  peer3Ops.forEach(op => peer1.applyRemote(op));
  
  // peer3 -> peer2 delete e to o
  peer3Ops.forEach(op => peer2.applyRemote(op));

  // peer1 -> peer3 l o <space>
  peer1Ops.slice(3).forEach(op => peer3.applyRemote(op));
  
  // peer2 -> peer3 l d !
  peer2Ops.slice(3).forEach(op => peer3.applyRemote(op));
  
  assert(peer1.toString() === 'Hlo rld!', `shouldNotDeleteTextPeerNotAwareOf failed: peer1 expected 'Hlo rld!', got ${peer1.toString()}`);
  assert(peer2.toString() === 'Hlo rld!', `shouldNotDeleteTextPeerNotAwareOf failed: peer2 expected 'Hlo rld!', got ${peer2.toString()}`);
  assert(peer3.toString() === 'Hlo rld!', `shouldNotDeleteTextPeerNotAwareOf failed: peer3 expected 'Hlo rld!', got ${peer3.toString()}`);
}

// peer1: H e l l o <space>
// peer2: W o r l d !
// peer1 -> peer2 H e
// peer2 -> peer1 W o r l d !
// peer1: deoete e to d (H e l l o <space> W o r l d !)
//                         ^ ^ ^ ^    ^    ^ ^ ^ ^ ^
// peer1 -> peer2 delete e to d
// assert peer1 == 'H!'
// assert peer2 == 'HeWorld!
// peer1 -> peer2 l l o <space>
// assert peer2 == 'H!'
function testAwaitingDeletionIfVersionVectorIsLessThanPeer() {
  const peer1 = new CrdtReplica({ id: 'peer1' });
  const peer2 = new CrdtReplica({ id: 'peer2' });
  
  const peer1Ops = []
  const peer2Ops = []

  const cursor1 = peer1.cursor();
  const cursor2 = peer2.cursor();

  // peer1: H e l l o <space>
  peer1Ops.push(cursor1.insert('H'));
  peer1Ops.push(cursor1.insert('e'));
  peer1Ops.push(cursor1.insert('l'));
  peer1Ops.push(cursor1.insert('l'));
  peer1Ops.push(cursor1.insert('o'));
  peer1Ops.push(cursor1.insert(' '));

  // peer2: W o r l d !
  peer2Ops.push(cursor2.insert('W'));
  peer2Ops.push(cursor2.insert('o'));
  peer2Ops.push(cursor2.insert('r'));
  peer2Ops.push(cursor2.insert('l'));
  peer2Ops.push(cursor2.insert('d'));
  peer2Ops.push(cursor2.insert('!'));

  // peer1 -> peer2 H e
  peer1Ops.slice(0, 2).forEach(op => peer2.applyRemote(op));
  // peer2 -> peer1 W o r l d !
  peer2Ops.forEach(op => peer1.applyRemote(op));

  // peer1: delete e to d (H e l l o <space> W o r l d !)
  cursor1.move(-4);
  peer1Ops.push(cursor1.delete(10));

  // peer1 -> peer2 delete e to d
  peer1Ops.slice(6).forEach(op => peer2.applyRemote(op));

  assert(peer1.toString() === 'H!', `shouleAwaitDeletionIfCurrentVersionVectorIsLessThanPeer failed: peer1 expected 'H!', got ${peer1.toString()}`);
  assert(peer2.toString() === 'HeWorld!', `shouleAwaitDeletionIfCurrentVersionVectorIsLessThanPeer failed: peer2 expected 'HeWorld!', got ${peer2.toString()}`);
  
  // peer1 -> peer2 l l o <space>
  peer1Ops.slice(2).forEach(op => peer2.applyRemote(op));

  assert(peer2.toString() === 'H!', `shouleAwaitDeletionIfCurrentVersionVectorIsLessThanPeer failed: peer2 expected 'H!', got ${peer2.toString()}`);
}

function getFunName(fun: () => void): string {
  return fun.toString().split(' ')[1];
}

for (const c of cases) {
  const caseName = getFunName(c.run);

  c.run()

  console.log(`✅ Case ${caseName} passed`);
}
