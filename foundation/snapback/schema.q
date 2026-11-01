-- Identity is supplied by verified ATproto OAuth through trusted session minting.
-- No password or guest account creation.

table armillaries:
  owner: principal
  name: text 1..80
  at: time default now
  immutable owner
  read <- exists armReaders[.id, viewer]
  insert <- .owner = viewer
  online only

table armReaders:
  armillary: armillaries
  principal: principal
  owner: principal
  unique armillary, principal
  cap 100 by armillary
  immutable armillary, principal, owner
  read <- .principal = viewer or .owner = viewer
  insert <- created armillaries[.armillary] or exists armillaries[.armillary, owner = viewer]
  sync

table modules:
  armillary: armillaries
  owner: principal
  name: text 1..80
  at: time default now
  immutable armillary, owner
  read <- exists members[.id, viewer]
  insert <- .owner = viewer and exists armillaries[.armillary, owner = viewer]
  sync to members[.id] by .principal

table members:
  module: modules
  armillary: armillaries
  principal: principal
  owner: principal
  access: enum('read', 'write')
  unique module, principal
  cap 100 by module
  immutable module, armillary, principal, owner
  read <- .principal = viewer or .owner = viewer
  insert <- created modules[.module] or (exists modules[.module, owner = viewer] and exists members[.module, viewer])
  update <- exists modules[.module, owner = viewer]
  delete <- exists modules[.module, owner = viewer]
  sync

table artifacts:
  module: modules
  author: principal
  body: text 1..12000
  source: text <=2000
  at: time default now
  immutable module, author, body, source, at
  read <- exists members[.module, viewer]
  insert <- .author = viewer and exists members[.module, viewer, access = 'write']
  sync to members[.module] by .principal last 500 by .at

table tasks:
  artifact: artifacts
  module: modules
  status: enum('pending', 'claimed', 'done')
  worker: principal ?
  leaseUntil: time ?
  at: time default now
  unique artifact
  immutable artifact, module
  read <- exists members[.module, viewer]
  insert <- exists members[.module, viewer, access = 'write']
  update <- exists members[.module, viewer, access = 'write']
  online only

table nodes:
  module: modules
  artifact: artifacts
  author: principal
  title: text 1..160
  body: text 1..12000
  at: time default now
  immutable module, artifact, author, title, body, at
  unique artifact
  read <- exists members[.module, viewer]
  insert <- .author = viewer and exists members[.module, viewer, access = 'write']
  sync to members[.module] by .principal last 500 by .at

table edges:
  module: modules
  source: nodes
  target: nodes
  author: principal
  relation: enum('relates', 'supports', 'questions', 'extends')
  reason: text 1..2000
  at: time default now
  immutable module, source, target, author, relation, reason, at
  read <- exists members[.module, viewer]
  insert <- .author = viewer and exists members[.module, viewer, access = 'write']
  online only

query armillariesList(c: cursor ?):
  return armillaries first 100 by .at after c
query modulesList(armillary: armillaries, c: cursor ?):
  return modules where .armillary = armillary first 100 by .at after c
query artifactsList(module: modules, c: cursor ?):
  return artifacts where .module = module last 50 by .at after c
query nodesList(module: modules, c: cursor ?):
  return nodes where .module = module last 50 by .at after c
query edgesList(module: modules, c: cursor ?):
  return edges where .module = module last 100 by .at after c
query tasksList(module: modules, c: cursor ?):
  return tasks where .module = module first 50 by .at after c
query membersList(module: modules, c: cursor ?):
  return members where .module = module first 100 by .principal after c

mutation createArmillary(name: text 1..80):
  a = insert armillaries { owner: viewer, name }
  insert armReaders { armillary: a.id, principal: viewer, owner: viewer }
  return a
mutation createModule(armillary: armillaries, name: text 1..80):
  require exists armillaries[armillary, owner = viewer] else NOT_OWNER
  m = insert modules { armillary, owner: viewer, name }
  insert members { module: m.id, armillary, principal: viewer, owner: viewer, access: 'write' }
  return m
mutation setMember(module: modules, principal: principal, access: enum('read', 'write')):
  m = modules[module] ! else NOT_FOUND
  require m.owner = viewer else NOT_OWNER
  require principal != m.owner else OWNER_MEMBERSHIP
  insert armReaders { armillary: m.armillary, principal, owner: viewer } if absent
  return upsert members[module, principal] { armillary: m.armillary, owner: m.owner, access }
mutation removeMember(module: modules, principal: principal):
  m = modules[module] ! else NOT_FOUND
  require m.owner = viewer else NOT_OWNER
  require principal != m.owner else OWNER_MEMBERSHIP
  delete members[module, principal]
  return null
mutation capture(module: modules, body: text 1..12000, source: text <=2000):
  a = insert artifacts { module, author: viewer, body, source }
  insert tasks { artifact: a.id, module, status: 'pending', worker: null, leaseUntil: null }
  return a
mutation claim(task: tasks): server
  t = tasks[task] ! else NOT_FOUND
  require t.status = 'pending' or (t.status = 'claimed' and t.leaseUntil != null and t.leaseUntil < now) else NOT_AVAILABLE
  update t { status: 'claimed', worker: viewer, leaseUntil: now + 300000 }
  return { artifact: t.artifact, leaseUntil: now + 300000 }
mutation complete(task: tasks, title: text 1..160, body: text 1..12000): server
  t = tasks[task] ! else NOT_FOUND
  require t.status = 'claimed' and t.worker = viewer and t.leaseUntil != null and t.leaseUntil >= now else NOT_CLAIMED
  n = insert nodes { module: t.module, artifact: t.artifact, author: viewer, title, body }
  update t { status: 'done', leaseUntil: null }
  return n
mutation release(task: tasks): server
  t = tasks[task] ! else NOT_FOUND
  require t.status = 'claimed' and t.worker = viewer else NOT_CLAIMED
  update t { status: 'pending', worker: null, leaseUntil: null }
  return null
mutation connect(source: nodes, target: nodes, relation: enum('relates', 'supports', 'questions', 'extends'), reason: text 1..2000):
  a = nodes[source] ! else NOT_FOUND
  b = nodes[target] ! else NOT_FOUND
  require a.module = b.module else DIFFERENT_MODULE
  require source != target else SAME_NODE
  return insert edges { module: a.module, source, target, author: viewer, relation, reason }

query currentIdentity():
  return { did: viewer }
