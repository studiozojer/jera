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

-- A rebuildable index of registered accounts' public Bluesky records. Import
-- authority stays in the existing trusted identity service, never the client.
-- A generation is exposed only after the worker completes a stable PDS scan.
table publicIndexAccounts:
  owner: principal
  generation: text <=26
  pending: text <=26
  revision: text <=128
  pds: text <=2048
  state: enum('pending', 'syncing', 'ready', 'error')
  checkedAt: time default now
  syncedAt: time ?
  unique owner
  immutable owner
  read <- .owner = viewer or viewer = 'service:atproto-auth'
  insert <- .owner = viewer
  update <- viewer = 'service:atproto-auth'
  online only

table publicIndexRecords:
  owner: principal
  generation: text 26..26
  key: text 64..64
  rootKey: text <=64
  isRoot: bool
  uri: text 1..2048
  cid: text 1..256
  body: text <=12000
  record: text 1..65536
  parent: text <=2048
  root: text <=2048
  at: time
  unique owner, generation, key
  immutable owner, generation, key, uri
  read <- .owner = viewer or viewer = 'service:atproto-auth'
  insert <- viewer = 'service:atproto-auth'
  update <- viewer = 'service:atproto-auth'
  delete <- viewer = 'service:atproto-auth'
  online only

mutation ensurePublicIndex():
  insert publicIndexAccounts { owner: viewer, generation: '', pending: '', revision: '', pds: '', state: 'pending', syncedAt: null } if absent
  return publicIndexAccounts[owner = viewer] ! else INDEX_UNAVAILABLE
query publicIndexStatus():
  return publicIndexAccounts[owner = viewer]
query publicIndexRoots(generation: text <=26, c: cursor ?):
  a = publicIndexAccounts[owner = viewer] ! else INDEX_UNAVAILABLE
  require generation = a.generation else INDEX_CHANGED
  return publicIndexRecords where .owner = viewer and .generation = a.generation and .isRoot last 50 by .at, .key after c
query publicIndexThread(generation: text <=26, key: text 64..64, c: cursor ?):
  a = publicIndexAccounts[owner = viewer] ! else INDEX_UNAVAILABLE
  require generation = a.generation else INDEX_CHANGED
  p = publicIndexRecords[owner = viewer, generation = a.generation, key = key] ! else POST_UNAVAILABLE
  root = p.rootKey if p.rootKey != '' else p.key
  return publicIndexRecords where .owner = viewer and .generation = a.generation and (.key = root or .rootKey = root) first 100 by .at, .key after c
query publicIndexAccountsList(c: cursor ?):
  require viewer = 'service:atproto-auth' else INDEX_WORKER_REQUIRED
  return publicIndexAccounts first 100 by .id after c
mutation beginPublicIndex(owner: principal, generation: text 26..26): server
  require viewer = 'service:atproto-auth' else INDEX_WORKER_REQUIRED
  a = publicIndexAccounts[owner = owner] ! else INDEX_UNAVAILABLE
  update a { pending: generation, state: 'syncing', checkedAt: now }
  return a
mutation stagePublicRecord(owner: principal, generation: text 26..26, key: text 64..64, rootKey: text <=64, isRoot: bool, uri: text 1..2048, cid: text 1..256, body: text <=12000, record: text 1..65536, parent: text <=2048, root: text <=2048, at: time): server
  require viewer = 'service:atproto-auth' else INDEX_WORKER_REQUIRED
  require exists publicIndexAccounts[owner = owner, pending = generation] else INDEX_SUPERSEDED
  return upsert publicIndexRecords[owner, generation, key] { uri, rootKey, isRoot, cid, body, record, parent, root, at }
mutation finishPublicIndex(owner: principal, generation: text 26..26, revision: text <=128, pds: text <=2048, expected: int 0..20000): server
  require viewer = 'service:atproto-auth' else INDEX_WORKER_REQUIRED
  a = publicIndexAccounts[owner = owner] ! else INDEX_UNAVAILABLE
  require a.pending = generation else INDEX_SUPERSEDED
  require count(publicIndexRecords where .owner = owner and .generation = generation) = expected else INDEX_INCOMPLETE
  update a { generation, pending: '', revision, pds, state: 'ready', checkedAt: now, syncedAt: now }
  return null
mutation checkPublicIndex(owner: principal, failed: bool): server
  require viewer = 'service:atproto-auth' else INDEX_WORKER_REQUIRED
  a = publicIndexAccounts[owner = owner] ! else INDEX_UNAVAILABLE
  update a { state: 'error' if failed else 'ready', pending: '', checkedAt: now }
  return null
query obsoletePublicRecords(owner: principal, c: cursor ?):
  require viewer = 'service:atproto-auth' else INDEX_WORKER_REQUIRED
  a = publicIndexAccounts[owner = owner] ! else INDEX_UNAVAILABLE
  return publicIndexRecords where .owner = owner and .generation != a.generation and .generation != a.pending first 100 by .id after c
mutation removeObsoletePublicRecord(id: publicIndexRecords): server
  require viewer = 'service:atproto-auth' else INDEX_WORKER_REQUIRED
  p = publicIndexRecords[id] ! else POST_UNAVAILABLE
  a = publicIndexAccounts[owner = p.owner] ! else INDEX_UNAVAILABLE
  require p.generation != a.generation and p.generation != a.pending else INDEX_ACTIVE
  delete p
  return null

-- Social records are independent of memory modules and organizing tasks.
-- The first private-audience UI is a DID list; audience IDs leave room for
-- later groups and resource-scoped grants without changing post ownership.
table audiences:
  owner: principal
  name: text 1..80
  kind: enum('owner', 'shared') default 'shared'
  unique owner, name
  immutable owner, name, kind
  read <- .owner = viewer or exists audienceMembers[.id, viewer] or viewer = 'service:atproto-auth'
  insert <- .owner = viewer
  online only

table audienceMembers:
  audience: audiences
  principal: principal
  owner: principal
  access: enum('read', 'reply')
  unique audience, principal
  cap 500 by audience
  immutable audience, principal, owner
  read <- .owner = viewer or .principal = viewer or viewer = 'service:atproto-auth'
  insert <- exists audiences[.audience, owner = viewer, kind = 'shared'] and .owner = viewer
  update <- exists audiences[.audience, owner = viewer, kind = 'shared']
  delete <- exists audiences[.audience, owner = viewer]
  online only

table posts:
  author: principal
  intent: text 26..26
  unique author, intent
  body: text <=12000
  lexicon: text 1..200 ?
  lexiconDigest: text 64..64 ?
  payloadJson: text 1..65536 ?
  deleted: bool default false
  visibility: enum('public', 'private')
  audience: audiences ?
  parent: posts ?
  root: posts ?
  at: time default now
  immutable author, intent, visibility, audience, parent, root, at, lexicon, lexiconDigest
  read <- .visibility = 'public' or exists audiences[.audience, owner = viewer] or exists audienceMembers[.audience, viewer] or viewer = 'service:atproto-auth'
  insert <- not .deleted and .body != '' and ((.author = viewer and .lexicon = null and .lexiconDigest = null and .payloadJson = null) or (viewer = 'service:atproto-auth' and .lexicon != null and .lexiconDigest != null and .payloadJson != null and .visibility = 'private' and .audience != null))
  update (old, next) <- old.author = viewer and next.deleted and next.body = '' and next.payloadJson = null
  online only

-- Unpublished drafts never share the posted audience. Each device keeps a
-- versioned private branch so delayed/offline saves cannot overwrite a newer one.
table socialDrafts:
  owner: principal
  deviceKey: text 26..26
  scope: text 1..200
  body: text <=12000
  revision: int 0..9007199254740991
  at: time default now
  unique owner, deviceKey, scope
  immutable owner, deviceKey, scope
  read <- .owner = viewer
  insert <- .owner = viewer
  update <- .owner = viewer
  online only

query draftForDevice(deviceKey: text 26..26, scope: text 1..200):
  return socialDrafts[owner = viewer, deviceKey = deviceKey, scope = scope]
query latestDraft(scope: text 1..200):
  return socialDrafts where .owner = viewer and .scope = scope last 1 by .at
query earlierPublicDrafts(c: cursor ?):
  return socialDrafts where .owner = viewer and .scope = 'root:public' and .body != '' last 100 by .at after c
query earlierPublicDraft(id: socialDrafts):
  return socialDrafts[id, owner = viewer, scope = 'root:public']
mutation saveSocialDraft(deviceKey: text 26..26, scope: text 1..200, body: text <=12000, revision: int 0..9007199254740991):
  existing = socialDrafts[owner = viewer, deviceKey = deviceKey, scope = scope]
  if existing != null and existing.revision >= revision:
    return existing
  return upsert socialDrafts[owner = viewer, deviceKey = deviceKey, scope = scope] { owner: viewer, deviceKey, scope, body, revision, at: now }

query postsList(c: cursor ?):
  return posts last 100 by .at after c
query postById(id: posts):
  return posts[id]
query postForIntent(intent: text 26..26):
  return posts[author = viewer, intent = intent]
query audienceList():
  return audiences where .owner = viewer and .name = 'Private' first 1 by .id
query availableAudiences(c: cursor ?):
  return audiences first 100 by .id after c
mutation createAudience(name: text 1..80, kind: enum('owner', 'shared')):
  require trim(name) != '' else EMPTY_AUDIENCE_NAME
  require name != 'Private' else RESERVED_AUDIENCE_NAME
  insert audiences { owner: viewer, name, kind } if absent
  a = audiences[owner = viewer, name = name] ! else AUDIENCE_UNAVAILABLE
  require a.kind = kind else AUDIENCE_KIND_CONFLICT
  return a
query audienceMembersList(audience: audiences, c: cursor ?):
  require exists audiences[audience, owner = viewer] else NOT_OWNER
  return audienceMembers where .audience = audience and .owner = viewer first 100 by .principal after c
mutation ensureAudience():
  insert audiences { owner: viewer, name: 'Private' } if absent
  return audiences[owner = viewer, name = 'Private'] ! else AUDIENCE_UNAVAILABLE
mutation setAudienceMember(audience: audiences, principal: principal, access: enum('read', 'reply')):
  require exists audiences[audience, owner = viewer] else NOT_OWNER
  require exists audiences[audience, kind = 'shared'] else OWNER_ONLY_AUDIENCE
  require principal != viewer else OWNER_MEMBERSHIP
  return upsert audienceMembers[audience, principal] { owner: viewer, access }
mutation removeAudienceMember(audience: audiences, principal: principal):
  require exists audiences[audience, owner = viewer] else NOT_OWNER
  require principal != viewer else OWNER_MEMBERSHIP
  delete audienceMembers[audience, principal]
  return null
-- Keep identity/intent and audience boundaries, never the deleted text. Other
-- authors' replies remain theirs; a delayed publish cannot resurrect this row.
mutation deletePost(id: posts):
  -- The named update rule authorizes the old author, including when a private
  -- audience has revoked their read access. No hidden content is returned.
  update posts[id] { body: '', payloadJson: null, deleted: true }
  return { id, deleted: true }
mutation publishPost(intent: text 26..26, body: text 1..12000, visibility: enum('public', 'private'), audience: audiences ?, parent: posts ?, draftDevice: text 26..26 ?, draftRevision: int 0..9007199254740991 ?, draftScope: text 1..200 ?):
  require trim(body) != '' else EMPTY_POST
  prior = posts[author = viewer, intent = intent]
  if prior != null:
    require prior.lexicon = null else INTENT_REUSE
    require (prior.deleted or prior.body = body) and prior.visibility = visibility and prior.audience = audience and prior.parent = parent else INTENT_REUSE
    return prior
  root = null
  scope = audience
  if parent != null:
    p = posts[parent] ! else PARENT_UNAVAILABLE
    require not p.deleted else PARENT_DELETED
    root = p.root if p.root != null else p.id
    if p.visibility = 'private':
      require visibility = 'private' else CANNOT_WIDEN_AUDIENCE
      require audience = p.audience else DIFFERENT_AUDIENCE
      require exists audiences[p.audience, owner = viewer] or exists audienceMembers[p.audience, viewer, access = 'reply'] else REPLY_NOT_ALLOWED
  if visibility = 'private':
    require scope != null else AUDIENCE_REQUIRED
    require exists audiences[scope, owner = viewer] or (parent != null and exists posts[parent, audience = scope] and exists audienceMembers[scope, viewer, access = 'reply']) else AUDIENCE_NOT_OWNED
  else:
    require scope = null else PUBLIC_AUDIENCE
  posted = insert posts { author: viewer, intent, body, visibility, audience: scope, parent, root }
  if draftDevice != null and draftRevision != null and draftScope != null:
    draft = socialDrafts[owner = viewer, deviceKey = draftDevice, scope = draftScope]
    if draft = null or (draft.revision <= draftRevision and draft.body = body):
      upsert socialDrafts[owner = viewer, deviceKey = draftDevice, scope = draftScope] { owner: viewer, deviceKey: draftDevice, scope: draftScope, body: '', revision: draftRevision + 1, at: now }
  return posted

-- The authenticated gateway validates the exact lexicon and payload before
-- calling this mutation. User sessions cannot supply arbitrary structured JSON.
-- The service rechecks record/audience permissions atomically for the bound DID.
mutation commitStructuredPost(author: principal, intent: text 26..26, audience: audiences, parent: posts ?, lexicon: text 1..200, lexiconDigest: text 64..64, payloadJson: text 1..65536, body: text 1..12000): server
  require viewer = 'service:atproto-auth' else RECORD_GATEWAY_REQUIRED
  require trim(body) != '' else EMPTY_POST
  a = audiences[audience] ! else AUDIENCE_UNAVAILABLE
  require a.owner = author or (parent != null and a.kind = 'shared' and exists audienceMembers[audience = audience, principal = author, access = 'reply']) else AUDIENCE_UNAVAILABLE
  prior = posts[author = author, intent = intent]
  if prior != null:
    require prior.lexicon = lexicon and prior.lexiconDigest = lexiconDigest and prior.visibility = 'private' and prior.audience = audience and prior.parent = parent else INTENT_REUSE
    require prior.deleted or (prior.payloadJson = payloadJson and prior.body = body) else INTENT_REUSE
    return prior
  root = null
  if parent != null:
    p = posts[parent] ! else PARENT_UNAVAILABLE
    require p.visibility = 'public' or exists audiences[p.audience, owner = author] or exists audienceMembers[audience = p.audience, principal = author] else PARENT_UNAVAILABLE
    require not p.deleted else PARENT_DELETED
    if p.visibility = 'private':
      require p.audience = audience else DIFFERENT_AUDIENCE
    if a.owner != author:
      require p.audience = audience else REPLY_NOT_ALLOWED
    root = p.root if p.root != null else p.id
  return insert posts { author, intent, body, visibility: 'private', audience, parent, root, lexicon, lexiconDigest, payloadJson }
