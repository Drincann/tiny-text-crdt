# Text CRDT for real-time collaborative editing

This repository contains a simple implementation of a text CRDT (Conflict-Free Replicated Data Type) designed for real-time collaborative editing.

This method implements a total order relation on the entire character set, ensuring Strong Eventual Consistency (SEC) without requiring a central server to coordinate conflicts. It enables conflict-free data replication in a distributed environment.

> Note: This implementation is intended for educational purposes to understand the CRDT theoretical model. Due to potential performance and stability issues, it is not recommended for production use.

## Environment

- Node.js v14+

## Run tests

```bash
$ npm test
```
## Features

- [x] Insert characters
- [ ] Delete characters
- [ ] Undo/Redo
- [ ] Network API
- [ ] Web UI example

## Usage

```typescript
import { TextCRDT } from './src';

const peer1 = new CrdtReplica({ id: 'peer1' });
const peer2 = new CrdtReplica({ id: 'peer2' });

const cursor1 = peer1.cursor();
const cursor2 = peer2.cursor();

// concurrent insert
const peer1Op1 = cursor1.insert('A');
const peer2Op1 = cursor2.insert('C');

// sync
peer2.applyRemote(peer1Op1);
peer1.applyRemote(peer2Op1);

// peer2 insert
cursor2.move(-1);
const peer2Op2 = cursor2.insert('B');

// sync
peer1.applyRemote(peer2Op2);

console.log(peer1.toString()); // 'ABC'
console.log(peer2.toString()); // 'ABC'
```

## License

DWTFYW (Do What The F*ck You Want) Public License

```
        DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
                    Version 2, December 2004

 Copyright (C) 2004 Sam Hocevar <sam@hocevar.net>

 Everyone is permitted to copy and distribute verbatim or modified
 copies of this license document, and changing it is allowed as long
 as the name is changed.

            DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
   TERMS AND CONDITIONS FOR COPYING, DISTRIBUTION AND MODIFICATION

  0. You just DO WHAT THE FUCK YOU WANT TO.
```