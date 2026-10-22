import { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, QUALITY_MEDIUM, WebMOutputFormat, getFirstEncodableAudioCodec, getFirstEncodableVideoCodec } from "mediabunny";
import type { Scene } from "./render";

/**
 * The video made: each frame drawn and encoded (faster than it plays, where the browser can encode:
 * WebCodecs), the recitation laid under it, as an MP4 (H.264 and AAC, for every phone and app), else a
 * WebM. A browser that cannot encode records it as it plays instead.
 */
export async function makeVideo(scene: Scene, audio: AudioBuffer, onProgress: (p: number) => void, signal: AbortSignal): Promise<{ blob: Blob; ext: "mp4" | "webm" }> {
  const fps = 30;
  if (typeof VideoEncoder === "undefined" || typeof AudioEncoder === "undefined") return record(scene, audio, fps, onProgress, signal);
  const { W, H } = scene;
  for (const kind of ["mp4", "webm"] as const) {
    const format = kind === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat();
    const vc = await getFirstEncodableVideoCodec(kind === "mp4" ? ["avc", "hevc", "vp9", "av1"] : ["vp9", "vp8", "av1"], { width: W, height: H, quality: QUALITY_HIGH });
    const ac = await getFirstEncodableAudioCodec(kind === "mp4" ? ["aac", "opus"] : ["opus", "vorbis"], { numberOfChannels: 2, sampleRate: audio.sampleRate, quality: QUALITY_HIGH });
    if (!vc || !ac) continue;
    const output = new Output({ format, target: new BufferTarget() });
    // (a quiet picture under grain: a middling rate keeps it small enough to send, the grain intact)
    const video = new CanvasSource(scene.canvas, { codec: vc, quality: QUALITY_MEDIUM, keyFrameInterval: 2 });
    const sound = new AudioBufferSource({ codec: ac, quality: QUALITY_HIGH });
    output.addVideoTrack(video, { frameRate: fps });
    output.addAudioTrack(sound);
    await output.start();
    const frames = Math.ceil(scene.duration * fps);
    for (let i = 0; i < frames; i++) {
      if (signal.aborted) {
        await output.cancel();
        throw new DOMException("Stopped", "AbortError");
      }
      scene.draw(i / fps);
      await video.add(i / fps, 1 / fps);
      if (i % 6 === 0) onProgress((i / frames) * 0.97);
    }
    await sound.add(audio);
    await output.finalize();
    onProgress(1);
    const buf = (output.target as BufferTarget).buffer!;
    return { blob: new Blob([buf], { type: kind === "mp4" ? "video/mp4" : "video/webm" }), ext: kind };
  }
  return record(scene, audio, fps, onProgress, signal);
}

/** Recorded as it plays (in real time): the canvas and the recitation together. */
async function record(scene: Scene, audio: AudioBuffer, fps: number, onProgress: (p: number) => void, signal: AbortSignal): Promise<{ blob: Blob; ext: "mp4" | "webm" }> {
  const ac = new AudioContext({ sampleRate: audio.sampleRate });
  const dest = ac.createMediaStreamDestination();
  const src = ac.createBufferSource();
  src.buffer = audio;
  src.connect(dest);
  const stream = new MediaStream([...scene.canvas.captureStream(fps).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mp4 = MediaRecorder.isTypeSupported("video/mp4");
  const rec = new MediaRecorder(stream, { mimeType: mp4 ? "video/mp4" : "video/webm", videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start(500);
  const t0 = ac.currentTime + 0.05;
  src.start(t0);
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = ac.currentTime - t0;
      if (signal.aborted || t >= scene.duration) return resolve();
      scene.draw(Math.max(0, t));
      onProgress(Math.max(0, t) / scene.duration);
      requestAnimationFrame(tick);
    };
    tick();
  });
  rec.stop();
  src.stop();
  await done;
  await ac.close();
  if (signal.aborted) throw new DOMException("Stopped", "AbortError");
  onProgress(1);
  return { blob: new Blob(chunks, { type: mp4 ? "video/mp4" : "video/webm" }), ext: mp4 ? "mp4" : "webm" };
}
