/*
 * Story 6.1 (FR-43, UX-DR17; `70-fotos.html` "Direct camera"): the in-app burst camera. The
 * opener goes straight to the viewfinder -- no chooser, no caption composer -- and the view
 * stays open after each "Disparar" until "Concluir fotos", counting the burst on the
 * opener's badge and in the status line. Each shot is saved at once with the context
 * caption fixed when the camera opened. A denied camera shows its reason and the OS path
 * under the opener (never a dialog, never a silent no-op); a browser with no camera API
 * falls back to the system camera through a hidden `capture` file input, one shot.
 *
 * Story 17.2: on a phone or a tablet the device's camera app takes the photos ("Câmera do
 * aparelho" in Conta, on by default where the device has touch points): every opener clicks
 * the same hidden `capture` input inside the press, one photo per tap, with the one-photo
 * toast; the viewfinder below is the switch's off state and the desktop's path.
 *
 * Story 9.1 ("Ler visor"): a burst may give each shot its own target (`shotTarget`, the
 * Measurement row the shot reads), the hint line naming the next one (`shotHint`); when there
 * is no next target the shutter is disabled and only "Concluir" is left.
 *
 * Story 13.1 (CAP-1): every session asks for the camera's full resolution (ideal 3840x2160)
 * and logs the track's settings once; a single shot is the camera's own photo
 * (`ImageCapture.takePhoto()`) where the browser has it, the frame grab otherwise or when
 * the photo fails or takes too long. Story 13.2 (CAP-2): torch, zoom (visible "-"/"+" and a
 * two-finger pinch on the finder) and tap-to-focus render only when the track offers them,
 * and the torch starts off in every session. Story 13.6 (CAP-4): while a refused shot is
 * held in memory the shutter is disabled with the reason in `.cam-hint`, and the opener
 * retries the held shot before it opens the camera again.
 *
 * Review 2026-10-08: a shot whose frame cannot be read or whose save fails while the burst is
 * open is said in `.cam-hint` (`data-state="failed"`) until the next shot saves, never in a toast
 * under the camera's opaque scrim (FLD-V1); once the camera is closing or closed, the toast says
 * it as before. From "Concluir" (and a single shot's shutter) until the view closes, `.cam-count`
 * says the shots are being saved and the shutter and "Concluir" are disabled (DB-4). The focus
 * goes back to the opener without scrolling the sheet (DE-2), and the screen stays awake while
 * the view is open (FLD-1).
 */

/*
 * E13-A6: the camera lives in five modules, and this one keeps the public API every opener and
 * test imports: the session (`camera-session.tsx`), the stream and the opener's press
 * (`camera-stream.ts`), the track's capabilities and controls on the shared pointer core
 * (`camera-controls.ts`), one shot and the system picker (`camera-single-shot.tsx`) and the
 * view itself (`camera-dialog.tsx`).
 */

export { useCamera, type CameraControl, type CameraOptions } from './camera-session.tsx';
export { CAMERA_CONSTRAINTS } from './camera-stream.ts';
export { cameraCapabilities, clampZoom, framePoint, zoomIncrement, type CameraCapabilities, type ZoomRange } from './camera-controls.ts';
export { TAKE_PHOTO_TIMEOUT_MS } from './camera-single-shot.tsx';
