import { useEffect, useRef, useState } from "react";

function BookingCheckInScanner({ onScan, error, busy }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timeoutRef = useRef(null);
  const [manualCode, setManualCode] = useState("");
  const [cameraMessage, setCameraMessage] = useState("");
  const [cameraActive, setCameraActive] = useState(false);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const stopCamera = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  const startCamera = async () => {
    setCameraMessage("");
    if (!navigator.mediaDevices?.getUserMedia || !window.BarcodeDetector) {
      setCameraMessage("Camera QR scanning is unavailable here. Use a USB QR scanner or enter the code below.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      setCameraActive(true);

      const scanFrame = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const value = codes.find((item) => item.rawValue)?.rawValue;
          if (value) {
            stopCamera();
            onScan(value);
            return;
          }
        } catch (_) {
          setCameraMessage("Could not read that QR code. Keep it inside the camera frame or enter the code below.");
        }
        timeoutRef.current = setTimeout(scanFrame, 300);
      };
      timeoutRef.current = setTimeout(scanFrame, 300);
    } catch (_) {
      stopCamera();
      setCameraMessage("Camera access failed. Use a USB QR scanner or enter the code below.");
    }
  };

  const submitManualCode = (event) => {
    event.preventDefault();
    if (manualCode.trim()) onScan(manualCode.trim());
  };

  return (
    <div className="booking-checkin-scanner">
      <div className="booking-checkin-scanner__video-wrap">
        <video
          ref={videoRef}
          className="booking-checkin-scanner__video"
          aria-label="Booking QR scanner camera"
          muted
          playsInline
        />
        {!cameraActive ? (
          <div className="booking-checkin-scanner__camera-empty">
            <span aria-hidden="true">▦</span>
            <span>Scan the customer’s booking QR code</span>
          </div>
        ) : null}
      </div>
      <div className="booking-checkin-scanner__actions">
        {!cameraActive ? (
          <button type="button" className="admin-action-button" onClick={startCamera} disabled={busy}>
            Start camera scanner
          </button>
        ) : (
          <button type="button" className="admin-action-button" onClick={stopCamera}>
            Stop camera
          </button>
        )}
      </div>
      {cameraMessage ? <p className="booking-checkin-scanner__message">{cameraMessage}</p> : null}
      <form className="booking-checkin-scanner__manual" onSubmit={submitManualCode}>
        <label htmlFor="booking-checkin-code">QR text or USB scanner input</label>
        <input
          id="booking-checkin-code"
          autoComplete="off"
          value={manualCode}
          onChange={(event) => setManualCode(event.target.value)}
          placeholder="GAMEGRUB-CHECKIN:1:..."
          disabled={busy}
        />
        <button type="submit" className="admin-action-button" disabled={busy || !manualCode.trim()}>
          {busy ? "Verifying..." : "Verify booking"}
        </button>
      </form>
      {error ? <div className="booking-checkin-scanner__error" role="alert">{error}</div> : null}
    </div>
  );
}

export default BookingCheckInScanner;
