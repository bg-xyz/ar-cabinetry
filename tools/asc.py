"""App Store Connect helper for Plywise (TestFlight chores without the web UI).

    python tools/asc.py builds                       recent builds + processing / beta state
    python tools/asc.py setup                        one-time: beta review contact, test info, external "Friends" group
    python tools/asc.py friends 7 "what to test"     add build 7 to Friends, set notes, submit for beta review
    python tools/asc.py invite someone@example.com   invite a tester to the Friends group

Needs: pip install pyjwt cryptography. Key ids come from %USERPROFILE%\\.config\\ragtime\\asc.json
({"issuer": ..., "keyId": ...}) and the .p8 key next to it. Nothing secret lives in this repo.
"""
import json, pathlib, sys, time, urllib.error, urllib.request
import jwt

CFG_DIR = pathlib.Path.home() / '.config' / 'ragtime'
CFG = json.loads((CFG_DIR / 'asc.json').read_text())
APP = '6826390742'            # Plywise: Custom Cabinets
RAGTIME_APP = '6824690930'    # same account: beta review contact details are copied from it
API = 'https://api.appstoreconnect.apple.com/v1'


def token():
    now = int(time.time())
    key = (CFG_DIR / f"AuthKey_{CFG['keyId']}.p8").read_text()
    return jwt.encode({'iss': CFG['issuer'], 'iat': now, 'exp': now + 1100, 'aud': 'appstoreconnect-v1'},
                      key, algorithm='ES256', headers={'kid': CFG['keyId'], 'typ': 'JWT'})


def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        sys.exit(f'{method} {path} -> {e.code}: {e.read().decode()[:600]}')


def friends_group():
    groups = call('GET', f'/apps/{APP}/betaGroups')['data']
    return next((g for g in groups if g['attributes']['name'] == 'Friends'), None)


def build(num):
    d = call('GET', f'/builds?filter[app]={APP}&filter[version]={num}')
    if not d['data']:
        sys.exit(f'build {num} not found yet (still uploading?)')
    return d['data'][0]


def builds():
    d = call('GET', f'/builds?filter[app]={APP}&sort=-uploadedDate&limit=6&include=buildBetaDetail')
    det = {x['id']: x['attributes'] for x in d.get('included', []) if x['type'] == 'buildBetaDetails'}
    for b in d['data']:
        bd = det.get(b['relationships']['buildBetaDetail']['data']['id'], {})
        print(b['attributes']['version'], b['attributes']['processingState'],
              'internal:', bd.get('internalBuildState'), 'external:', bd.get('externalBuildState'))


def setup():
    # beta review contact = the same person as Ragtime's
    src = call('GET', f'/apps/{RAGTIME_APP}/betaAppReviewDetail')['data']['attributes']
    contact = {k: src[k] for k in ('contactFirstName', 'contactLastName', 'contactPhone', 'contactEmail')}
    call('PATCH', f'/betaAppReviewDetails/{APP}', {'data': {'type': 'betaAppReviewDetails', 'id': APP, 'attributes': {
        **contact, 'demoAccountRequired': False,
        'notes': ('Plywise scans a room with RoomPlan (LiDAR iPhone or iPad Pro required), then places a cabinet design on a wall '
                  'in AR. No account or sign-in. To test: Scan the room > Done scanning > tap a highlighted wall > use the menus '
                  'to change design and finishes. On devices without LiDAR the app explains that scanning is unavailable.')}}})
    info = {'feedbackEmail': contact['contactEmail'], 'marketingUrl': 'https://plywise.xyz',
            'privacyPolicyUrl': 'https://plywise.xyz/privacy.html',
            'description': ('Plywise turns a room scan into modern European cabinetry designed for your exact space and shows it '
                            'life-size in AR. Try it: scan a room, tap a wall, walk around the cabinet, switch designs and finishes. '
                            'Needs an iPhone Pro (12 Pro or newer) for the LiDAR scan.')}
    locs = call('GET', f'/apps/{APP}/betaAppLocalizations')['data']
    if locs:
        call('PATCH', f"/betaAppLocalizations/{locs[0]['id']}", {'data': {'type': 'betaAppLocalizations', 'id': locs[0]['id'], 'attributes': info}})
    else:
        call('POST', '/betaAppLocalizations', {'data': {'type': 'betaAppLocalizations', 'attributes': {'locale': 'en-US', **info},
                                                        'relationships': {'app': {'data': {'type': 'apps', 'id': APP}}}}})
    if not friends_group():
        call('POST', '/betaGroups', {'data': {'type': 'betaGroups', 'attributes': {
            'name': 'Friends', 'publicLinkEnabled': True, 'publicLinkLimitEnabled': True, 'publicLinkLimit': 100},
            'relationships': {'app': {'data': {'type': 'apps', 'id': APP}}}}})
    g = friends_group()
    print('setup done; Friends group', g['id'], 'public link:', g['attributes'].get('publicLink'))


def friends(num, notes):
    b = build(num)
    if b['attributes']['processingState'] != 'VALID':
        sys.exit(f"build {num} is {b['attributes']['processingState']}; try again in a few minutes")
    bid, g = b['id'], friends_group()
    loc = call('GET', f'/builds/{bid}/betaBuildLocalizations')['data']
    if loc:
        call('PATCH', f"/betaBuildLocalizations/{loc[0]['id']}", {'data': {'type': 'betaBuildLocalizations', 'id': loc[0]['id'], 'attributes': {'whatsNew': notes}}})
    else:
        call('POST', '/betaBuildLocalizations', {'data': {'type': 'betaBuildLocalizations', 'attributes': {'locale': 'en-US', 'whatsNew': notes},
                                                          'relationships': {'build': {'data': {'type': 'builds', 'id': bid}}}}})
    call('POST', f"/betaGroups/{g['id']}/relationships/builds", {'data': [{'type': 'builds', 'id': bid}]})
    if not call('GET', f'/betaAppReviewSubmissions?filter[build]={bid}')['data']:
        call('POST', '/betaAppReviewSubmissions', {'data': {'type': 'betaAppReviewSubmissions',
                                                            'relationships': {'build': {'data': {'type': 'builds', 'id': bid}}}}})
    print(f'build {num}: notes set, added to Friends, beta review submitted')
    builds()


def invite(email):
    # Always create the tester for this app's group: a tester record that already exists for another app
    # (e.g. a Ragtime tester) can't be attached directly (409 "Tester(s) cannot be assigned").
    g = friends_group()
    call('POST', '/betaTesters', {'data': {'type': 'betaTesters', 'attributes': {'email': email},
                                           'relationships': {'betaGroups': {'data': [{'type': 'betaGroups', 'id': g['id']}]}}}})
    print(f'{email} added to Friends (TestFlight emails the invite once a build is approved for external testing)')

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'builds'
    {'builds': builds, 'setup': setup}.get(cmd, lambda: None)()
    if cmd == 'friends':
        friends(sys.argv[2], sys.argv[3])
    elif cmd == 'invite':
        invite(sys.argv[2])
