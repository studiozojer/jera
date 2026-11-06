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

-- Social records are independent of memory modules and organizing tasks.
-- The first private-audience UI is a DID list; audience IDs leave room for
-- later groups and resource-scoped grants without changing post ownership.
table audiences:
  owner: principal
  name: text 1..80
  unique owner, name
  immutable owner, name
  read <- .owner = viewer or exists audienceMembers[.id, viewer]
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
  read <- .owner = viewer or .principal = viewer
  insert <- exists audiences[.audience, owner = viewer] and .owner = viewer
  update <- exists audiences[.audience, owner = viewer]
  delete <- exists audiences[.audience, owner = viewer]
  online only

table posts:
  author: principal
  intent: text 26..26
  unique author, intent
  body: text <=12000
  deleted: bool default false
  visibility: enum('public', 'private')
  audience: audiences ?
  parent: posts ?
  root: posts ?
  at: time default now
  immutable author, intent, visibility, audience, parent, root, at
  read <- .visibility = 'public' or exists audiences[.audience, owner = viewer] or exists audienceMembers[.audience, viewer]
  insert <- .author = viewer and not .deleted and .body != ''
  update (old, next) <- old.author = viewer and next.deleted and next.body = ''
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
query audienceMembersList(audience: audiences, c: cursor ?):
  require exists audiences[audience, owner = viewer] else NOT_OWNER
  return audienceMembers where .audience = audience and .owner = viewer first 100 by .principal after c
mutation ensureAudience():
  insert audiences { owner: viewer, name: 'Private' } if absent
  return audiences[owner = viewer, name = 'Private'] ! else AUDIENCE_UNAVAILABLE
mutation setAudienceMember(audience: audiences, principal: principal, access: enum('read', 'reply')):
  require exists audiences[audience, owner = viewer] else NOT_OWNER
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
  update posts[id] { body: '', deleted: true }
  return { id, deleted: true }
mutation publishPost(intent: text 26..26, body: text 1..12000, visibility: enum('public', 'private'), audience: audiences ?, parent: posts ?, draftDevice: text 26..26 ?, draftRevision: int 0..9007199254740991 ?, draftScope: text 1..200 ?):
  require trim(body) != '' else EMPTY_POST
  prior = posts[author = viewer, intent = intent]
  if prior != null:
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
