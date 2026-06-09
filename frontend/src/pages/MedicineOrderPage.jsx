import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import L from "leaflet";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  FileImage,
  Lock,
  Mic,
  PackagePlus,
  PauseCircle,
  Play,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from "lucide-react";

import {
  createPharmacyOrder,
  createPharmacyOrderWithMedia,
  getCurrentUser,
  listCustomerAddresses,
  listNearbyPharmacies,
} from "../lib/api.js";

const medicineCatalog = [
  "Paracetamol 500mg",
  "Atorvastatin 20mg",
  "Amoxicillin 625mg",
  "Cetirizine 10mg",
  "Pantoprazole 40mg",
  "Azithromycin 500mg",
];

const typeOptions = ["Strip", "Capsule", "Liquid Bottle", "Box", "Grams"];
const MAX_PHARMACY_DISTANCE_KM = 60;
const FORM_DRAFT_KEY = "thean_medicine_form_draft";

function moneyValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value) {
  return value.toFixed(2);
}

function calculateLeafletDistanceKm(firstPoint, secondPoint) {
  const firstLatitude = Number(firstPoint?.latitude);
  const firstLongitude = Number(firstPoint?.longitude);
  const secondLatitude = Number(secondPoint?.latitude);
  const secondLongitude = Number(secondPoint?.longitude);

  if (
    !Number.isFinite(firstLatitude) ||
    !Number.isFinite(firstLongitude) ||
    !Number.isFinite(secondLatitude) ||
    !Number.isFinite(secondLongitude)
  ) {
    return null;
  }

  return L.latLng(firstLatitude, firstLongitude).distanceTo(
    L.latLng(secondLatitude, secondLongitude),
  ) / 1000;
}

function scoreMatch(query, item) {
  const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedItem = item.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!normalizedQuery) return 0;
  if (normalizedItem.includes(normalizedQuery)) return 100;
  let score = 0;
  let index = 0;
  for (const character of normalizedQuery) {
    index = normalizedItem.indexOf(character, index);
    if (index === -1) return score;
    score += 8;
    index += 1;
  }
  return score;
}

export function MedicineOrderPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selectedMedicine, setSelectedMedicine] = useState("");
  const [metric, setMetric] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [cart, setCart] = useState([]);
  const [doctorName, setDoctorName] = useState("Self");
  const [patientName, setPatientName] = useState("");
  const [prescriptionFiles, setPrescriptionFiles] = useState([]);
  const [isCameraGuideOpen, setIsCameraGuideOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(120);
  const [voiceAttached, setVoiceAttached] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [voicePreviewUrl, setVoicePreviewUrl] = useState("");
  const [voiceBlob, setVoiceBlob] = useState(null);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [submitValidationError, setSubmitValidationError] = useState("");
  const [substitutionAllowed, setSubstitutionAllowed] = useState(false);
  const [inventoryProtection, setInventoryProtection] = useState(true);
  const [billingMode, setBillingMode] = useState("auto");
  const [restrictedDrugNoticeAccepted, setRestrictedDrugNoticeAccepted] = useState(false);
  const [processingMode, setProcessingMode] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [savedDeliveryAddresses, setSavedDeliveryAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [addressStatus, setAddressStatus] = useState("");
  const [isLoadingPharmacies, setIsLoadingPharmacies] = useState(false);
  const [nearbyPharmacies, setNearbyPharmacies] = useState([]);
  const [pharmacyChoiceMode, setPharmacyChoiceMode] = useState("auto");
  const [selectedPharmacyId, setSelectedPharmacyId] = useState("");
  const [lockedPharmacy, setLockedPharmacy] = useState(null);
  const [manualRadiusKm, setManualRadiusKm] = useState(5);

  // ── New state ───────────────────────────────────────────────────────────────
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [pendingNavTarget, setPendingNavTarget] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [offerLockUnderstood, setOfferLockUnderstood] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);

  const intervalRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioStreamRef = useRef(null);
  const audioPreviewRef = useRef(null);
  const voicePanelRef = useRef(null);
  const draftLoadedRef = useRef(false);
  const recordingStartPendingRef = useRef(false);
  const stopAfterStartRef = useRef(false);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const matches = useMemo(() => {
    if (selectedMedicine && query === selectedMedicine) return [];

    return medicineCatalog
      .map((item) => ({ item, score: scoreMatch(query, item) }))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [query, selectedMedicine]);

  const recommendedPharmacy = nearbyPharmacies[0] || null;
  const selectedAddress =
    savedDeliveryAddresses.find((address) => address.address_id === selectedAddressId) || null;
  const lockedPharmacyWithLocation = lockedPharmacy
    ? {
        ...(nearbyPharmacies.find((pharmacy) => pharmacy.account_id === lockedPharmacy.account_id) || {}),
        ...lockedPharmacy,
      }
    : null;
  const selectedPharmacy =
    lockedPharmacyWithLocation ||
    (pharmacyChoiceMode === "auto"
      ? recommendedPharmacy
      : nearbyPharmacies.find((pharmacy) => pharmacy.account_id === selectedPharmacyId));
  const isSelectedPharmacyOffline = selectedPharmacy?.is_online === false;
  const selectedPharmacyDistanceKm = calculateLeafletDistanceKm(selectedAddress, selectedPharmacy);
  const hasExceededPharmacyDistance =
    selectedPharmacyDistanceKm !== null && selectedPharmacyDistanceKm > MAX_PHARMACY_DISTANCE_KM;
  const isLockedOfferOrder = Boolean(lockedPharmacy);
  const effectiveBillingMode = isLockedOfferOrder ? "auto" : billingMode;
  const effectiveInventoryProtection = isLockedOfferOrder ? false : inventoryProtection;
  const basketTotal = cart.reduce(
    (total, item) => total + moneyValue(item.customerPrice) * (Number(item.quantity) || 0),
    0,
  );

  // Page is "dirty" if user has unsaved work worth warning about
  const isDirty = cart.length > 0 || prescriptionFiles.length > 0 || Boolean(voiceBlob);

  // Voice countdown warning — last 10 seconds
  const voiceCountdownWarning = isRecording && recordingSeconds <= 10;

  // Submit button gating — restricted-drug checkbox + offer-lock acknowledgement
  const canSubmit = restrictedDrugNoticeAccepted && (!isLockedOfferOrder || offerLockUnderstood);

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    let ignore = false;

    async function loadCurrentUser() {
      try {
        const user = await getCurrentUser();
        if (!ignore) {
          setPatientName(user.full_name || "");
        }
      } catch {
        if (!ignore) {
          setPatientName("");
        }
      }
    }

    async function loadSavedAddresses() {
      try {
        const response = await listCustomerAddresses();
        if (ignore) return;
        setSavedDeliveryAddresses(response);
        const defaultAddress = response.find((address) => address.is_default) || response[0];
        setSelectedAddressId(defaultAddress?.address_id || "");
        if (!defaultAddress) {
          setAddressStatus("No saved delivery address found. Add an address before choosing a pharmacy.");
        }
      } catch (requestError) {
        if (ignore) return;
        setAddressStatus(requestError.message);
      }
    }

    loadCurrentUser();
    loadSavedAddresses();

    return () => {
      ignore = true;
    };
  }, []);

  // Load product-bucket draft (from PharmacyProductsPage "Add to bucket")
  useEffect(() => {
    if (draftLoadedRef.current) return;
    draftLoadedRef.current = true;

    const draft = window.localStorage.getItem("thean_pharmacy_order_draft");
    if (!draft) return;

    try {
      const parsedDraft = JSON.parse(draft);
      const draftItems = Array.isArray(parsedDraft.items) ? parsedDraft.items : [];
      if (parsedDraft.locked_pharmacy?.account_id) {
        setLockedPharmacy(parsedDraft.locked_pharmacy);
        setPharmacyChoiceMode("locked");
        setSelectedPharmacyId(parsedDraft.locked_pharmacy.account_id);
      }
      if (draftItems.length) {
        setCart((current) => [
          ...current,
          ...draftItems.map((item) => ({
            id: crypto.randomUUID(),
            name: item.name,
            metric: item.metric || "Box",
            quantity: Number(item.quantity) || 1,
            lockedPharmacyName: item.pharmacy_name,
            customerPrice: item.customer_price,
            offerPrice: item.offer_price,
            price: item.price,
          })),
        ]);
      }
    } catch {
      // Ignore malformed draft data and let the user continue with a blank basket.
    } finally {
      window.localStorage.removeItem("thean_pharmacy_order_draft");
      // Clear the form draft too — product draft takes priority
      window.localStorage.removeItem(FORM_DRAFT_KEY);
    }
  }, []);

  // Restore saved form draft (from "Save draft" button)
  useEffect(() => {
    // Skip if a product-bucket draft is present (handled above)
    if (window.localStorage.getItem("thean_pharmacy_order_draft")) return;

    const saved = window.localStorage.getItem(FORM_DRAFT_KEY);
    if (!saved) return;
    try {
      const d = JSON.parse(saved);
      if (d.doctorName) setDoctorName(d.doctorName);
      if (d.patientName) setPatientName(d.patientName);
      if (Array.isArray(d.cart) && d.cart.length) {
        setCart(d.cart.map((item) => ({ ...item, id: crypto.randomUUID() })));
      }
      if (d.pharmacyChoiceMode) setPharmacyChoiceMode(d.pharmacyChoiceMode);
      if (d.selectedAddressId) setSelectedAddressId(d.selectedAddressId);
      if (d.lockedPharmacy) {
        setLockedPharmacy(d.lockedPharmacy);
        setPharmacyChoiceMode("locked");
      }
      if (typeof d.substitutionAllowed === "boolean") setSubstitutionAllowed(d.substitutionAllowed);
      if (d.billingMode) setBillingMode(d.billingMode);
      if (typeof d.inventoryProtection === "boolean") setInventoryProtection(d.inventoryProtection);
    } catch {
      // Ignore corrupt draft
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let ignore = false;

    async function refreshPharmaciesForAddress() {
      if (!selectedAddress) {
        setNearbyPharmacies([]);
        setSelectedPharmacyId("");
        return;
      }

      setIsLoadingPharmacies(true);
      setAddressStatus(`Refreshing pharmacy options for ${selectedAddress.label}...`);
      try {
        const radiusKm = lockedPharmacy ? MAX_PHARMACY_DISTANCE_KM : pharmacyChoiceMode === "manual" ? manualRadiusKm : 5;
        const response = await listNearbyPharmacies(
          selectedAddress.latitude,
          selectedAddress.longitude,
          radiusKm,
        );
        if (ignore) return;
        setNearbyPharmacies(response);
        const defaultPharmacy =
          lockedPharmacy ||
          (pharmacyChoiceMode === "manual"
            ? response.slice().sort((a, b) => a.distance_km - b.distance_km)[0]
            : response[0]);
        setSelectedPharmacyId(defaultPharmacy?.account_id || "");
        setAddressStatus(`${response.length} eligible pharmacies found within ${radiusKm} KM of ${selectedAddress.label}.`);
      } catch (requestError) {
        if (ignore) return;
        setNearbyPharmacies([]);
        setSelectedPharmacyId("");
        setAddressStatus(requestError.message);
      } finally {
        if (!ignore) {
          setIsLoadingPharmacies(false);
        }
      }
    }

    refreshPharmaciesForAddress();

    return () => {
      ignore = true;
    };
  }, [lockedPharmacy, manualRadiusKm, pharmacyChoiceMode, selectedAddress]);

  useEffect(() => {
    return () => {
      window.clearInterval(intervalRef.current);
      audioStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (voicePreviewUrl) {
        URL.revokeObjectURL(voicePreviewUrl);
      }
    };
  }, [voicePreviewUrl]);

  // Reset offer-lock acknowledgement when the lock is cleared
  useEffect(() => {
    if (!lockedPharmacy) setOfferLockUnderstood(false);
  }, [lockedPharmacy]);

  // ── Functions ───────────────────────────────────────────────────────────────

  function addMedicine() {
    if (!selectedMedicine || !metric || Number(quantity) <= 0) return;
    setCart((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: selectedMedicine,
        metric,
        quantity: Number(quantity),
      },
    ]);
    setQuery("");
    setSelectedMedicine("");
    setMetric("");
    setQuantity("1");
  }

  function selectMedicine(medicineName) {
    setSelectedMedicine(medicineName);
    setQuery(medicineName);
  }

  function updateCartQuantity(itemId, nextQuantity) {
    const normalizedQuantity = Math.max(Number(nextQuantity) || 1, 1);
    setCart((current) =>
      current.map((item) => (item.id === itemId ? { ...item, quantity: normalizedQuantity } : item)),
    );
  }

  function removeCartItem(itemId) {
    setCart((current) => {
      const nextCart = current.filter((item) => item.id !== itemId);
      if (!nextCart.some((item) => item.lockedPharmacyName)) {
        setLockedPharmacy(null);
        setPharmacyChoiceMode("auto");
        setSelectedPharmacyId(recommendedPharmacy?.account_id || "");
      }
      return nextCart;
    });
  }

  function finishRecording() {
    window.clearInterval(intervalRef.current);
    intervalRef.current = null;
    setIsRecording(false);
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
  }

  async function startRecording() {
    if (intervalRef.current || isRecording || recordingStartPendingRef.current) return;

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setVoiceStatus("Voice recording is not supported in this browser.");
      return;
    }

    try {
      recordingStartPendingRef.current = true;
      stopAfterStartRef.current = false;
      if (voicePreviewUrl) {
        URL.revokeObjectURL(voicePreviewUrl);
      }
      setVoicePreviewUrl("");
      setVoiceBlob(null);
      setVoiceStatus("");
      setSubmitValidationError("");
      setHasRecording(false);
      setVoiceAttached(false);
      setRecordingSeconds(120);
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        if (blob.size > 0) {
          setVoicePreviewUrl(URL.createObjectURL(blob));
          setVoiceBlob(blob);
          setHasRecording(true);
          setVoiceAttached(true);
          setSubmitValidationError("");
          setVoiceStatus("Voice note attached to order automatically.");
        } else {
          setHasRecording(false);
          setVoiceAttached(false);
          setVoiceStatus("No voice was captured. Please hold the button and try again.");
        }
        mediaRecorderRef.current = null;
      };

      recorder.start();
      recordingStartPendingRef.current = false;
      setIsRecording(true);
      if (stopAfterStartRef.current) {
        stopRecording();
        return;
      }
    } catch (error) {
      recordingStartPendingRef.current = false;
      setVoiceStatus("Microphone permission is required to record a voice note.");
      finishRecording();
      return;
    }

    intervalRef.current = window.setInterval(() => {
      setRecordingSeconds((current) => {
        if (current <= 1) {
          stopRecording();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }

  function stopRecording() {
    if (recordingStartPendingRef.current) {
      stopAfterStartRef.current = true;
      return;
    }
    if (!intervalRef.current && !isRecording && mediaRecorderRef.current?.state !== "recording") return;
    finishRecording();
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }

  function resetRecording() {
    finishRecording();
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (voicePreviewUrl) {
      URL.revokeObjectURL(voicePreviewUrl);
    }
    setVoicePreviewUrl("");
    setVoiceStatus("");
    setSubmitValidationError("");
    setHasRecording(false);
    setVoiceAttached(false);
    setVoiceBlob(null);
    setRecordingSeconds(120);
  }

  async function playVoiceRecording() {
    if (!audioPreviewRef.current) {
      setVoiceStatus("No recording is available for playback.");
      return;
    }

    try {
      audioPreviewRef.current.currentTime = 0;
      await audioPreviewRef.current.play();
      setVoiceStatus("Playing voice recording.");
    } catch (error) {
      setVoiceStatus("Playback could not start. Please use the audio controls.");
    }
  }

  /** Intercept in-app navigation when the form is dirty. */
  function handleNavAway(to) {
    if (isDirty) {
      setPendingNavTarget(to);
      setShowLeaveModal(true);
    } else {
      navigate(to);
    }
  }

  function confirmLeave() {
    setShowLeaveModal(false);
    navigate(pendingNavTarget);
  }

  /** Persist form state to localStorage. Files/voice cannot be saved. */
  function saveDraft() {
    window.localStorage.setItem(
      FORM_DRAFT_KEY,
      JSON.stringify({
        doctorName,
        patientName,
        cart,
        pharmacyChoiceMode,
        selectedAddressId,
        lockedPharmacy,
        substitutionAllowed,
        billingMode,
        inventoryProtection,
      }),
    );
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 2500);
  }

  /** Run validations then open the confirmation modal. */
  function openConfirmModal() {
    if (!selectedAddress) {
      setSubmitValidationError("Choose a delivery address before submitting the medicine order.");
      return;
    }
    if (!selectedPharmacy) {
      setSubmitValidationError("Choose a pharmacy before submitting the medicine order.");
      return;
    }
    if (isSelectedPharmacyOffline) {
      setSubmitValidationError("This pharmacy is offline and can't take any order right now. Please choose another pharmacy or use auto choose.");
      return;
    }
    if (selectedPharmacyDistanceKm === null) {
      setSubmitValidationError("Unable to verify pharmacy distance. Please refresh pharmacy selection and try again.");
      return;
    }
    if (selectedPharmacyDistanceKm > MAX_PHARMACY_DISTANCE_KM) {
      setSubmitValidationError(
        `Selected pharmacy is ${selectedPharmacyDistanceKm.toFixed(1)} KM from your delivery address. Maximum allowed distance is ${MAX_PHARMACY_DISTANCE_KM} KM.`,
      );
      return;
    }
    setSubmitValidationError("");
    setShowConfirmModal(true);
  }

  async function submitOrder() {
    setShowConfirmModal(false);
    setSubmitValidationError("");
    setSubmitError("");
    setProcessingMode(true);
    try {
      const orderPayload = {
        doctor_name: doctorName.trim() || "Self",
        patient_name: patientName.trim() || "Customer",
        items: cart.map((item) => ({
          name: item.name,
          metric: item.metric,
          quantity: item.quantity,
          unit_price: item.customerPrice || null,
          line_total: item.customerPrice
            ? formatMoney(moneyValue(item.customerPrice) * item.quantity)
            : null,
        })),
        pharmacy_name: selectedPharmacy?.store_name || null,
        pharmacy_city: selectedPharmacy?.city || null,
        pharmacy_pincode: selectedPharmacy?.pincode || null,
        billing_mode: effectiveBillingMode,
        inventory_protection: effectiveInventoryProtection,
        has_prescription: prescriptionFiles.length > 0,
        has_voice_note: voiceAttached,
        substitution_allowed: substitutionAllowed,
        notes: {
          address_label: selectedAddress?.label || null,
          address_latitude: selectedAddress?.latitude ?? null,
          address_longitude: selectedAddress?.longitude ?? null,
          pharmacy_choice_mode: pharmacyChoiceMode,
          auto_choose_pharmacy: pharmacyChoiceMode === "auto",
          selected_pharmacy_account_id: selectedPharmacy?.account_id || null,
          locked_pharmacy_account_id: lockedPharmacy?.account_id || null,
          locked_offer_order: Boolean(lockedPharmacy),
        },
      };
      const attachedVoiceBlob = voiceAttached ? voiceBlob : null;
      if (prescriptionFiles.length > 0 || attachedVoiceBlob) {
        const namedVoiceBlob = attachedVoiceBlob
          ? new File([attachedVoiceBlob], "voice-note.webm", { type: attachedVoiceBlob.type || "audio/webm" })
          : null;
        await createPharmacyOrderWithMedia(orderPayload, prescriptionFiles, namedVoiceBlob);
      } else {
        await createPharmacyOrder(orderPayload);
      }
      // Order submitted — clear saved form draft
      window.localStorage.removeItem(FORM_DRAFT_KEY);
      navigate("/home/pharmacy/orders");
    } catch (requestError) {
      setSubmitError(requestError.message);
      setProcessingMode(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (processingMode) {
    return (
      <section className="medicine-layout">
        <div className="processing-screen">
          <div className="processing-pulse" />
          <p className="eyebrow">Secure compilation</p>
          <h1>Pharmacy is compiling your digital bill...</h1>
          <p>Checking real-time inventory shelves. Hold tight! Estimated wait: under 2 minutes.</p>
          <div className="validation-row">
            <span><CheckCircle2 size={18} /> Prescription Photo Attached</span>
            <span><CheckCircle2 size={18} /> Voice Note Attached</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="medicine-layout">
      <div className="pharmacy-page-header">
        {/* Intercepted back navigation — warns if form is dirty */}
        <button
          className="icon-text-button"
          type="button"
          onClick={() => handleNavAway("/home/pharmacy")}
        >
          <ArrowLeft size={18} aria-hidden="true" />
          Pharmacy
        </button>
        <div>
          <p className="eyebrow">Order medicine</p>
          <h1>Build one medicine order</h1>
          <p>Add medicines by text, prescription photo, and voice note into one checkout basket.</p>
        </div>
      </div>

      <div className="medicine-grid">
        <article className="medicine-panel">
          <h2>Text input</h2>
          <div className="inline-control-grid patient-details-grid">
            <label>
              Doctor name
              <input
                value={doctorName}
                onChange={(event) => setDoctorName(event.target.value)}
                placeholder="Doctor name"
              />
            </label>
            <label>
              Patient name
              <input
                value={patientName}
                onChange={(event) => setPatientName(event.target.value)}
                placeholder="Patient name"
              />
            </label>
          </div>
          <label>
            Search medicine
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedMedicine("");
              }}
              placeholder="Try Paracetamol"
            />
          </label>
          {matches.length ? (
            <div className="suggestion-list">
              {matches.map((match) => (
                <button type="button" key={match.item} onClick={() => selectMedicine(match.item)}>
                  {match.item}
                </button>
              ))}
            </div>
          ) : null}
          {selectedMedicine ? (
            <div className="selected-medicine-chip">
              <CheckCircle2 size={16} />
              Selected: {selectedMedicine}
            </div>
          ) : null}
          <div className="inline-control-grid">
            <label>
              Type
              <select value={metric} onChange={(event) => setMetric(event.target.value)}>
                <option value="">Select type</option>
                {typeOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label>
              Quantity
              <input value={quantity} onChange={(event) => setQuantity(event.target.value)} min="1" type="number" />
            </label>
          </div>
          <button className="button" type="button" onClick={addMedicine} disabled={!selectedMedicine || !metric}>
            <PackagePlus size={18} />
            Add to basket
          </button>
        </article>

        <article className="medicine-panel">
          <h2>Upload prescription</h2>
          <button className="button button-secondary" type="button" onClick={() => setIsCameraGuideOpen(true)}>
            <Camera size={18} />
            Upload Prescription
          </button>
          <label className="upload-drop">
            <Upload size={22} />
            Fallback upload PDF, JPEG, or PNG
            <input
              accept="application/pdf,image/jpeg,image/png"
              multiple
              onChange={(event) => setPrescriptionFiles(Array.from(event.target.files || []))}
              type="file"
            />
          </label>
          {prescriptionFiles.length ? (
            <p className="attached-note"><FileImage size={16} /> {prescriptionFiles.length} file attached</p>
          ) : null}
        </article>

        <article
          className="medicine-panel voice-panel"
          ref={voicePanelRef}
        >
          <h2>Voice over prescription</h2>
          {!hasRecording ? (
            <button
              className={`mic-button ${isRecording ? "mic-button-recording" : ""}`}
              type="button"
              onPointerCancel={stopRecording}
              onPointerDown={startRecording}
              onPointerLeave={stopRecording}
              onPointerUp={stopRecording}
            >
              <Mic size={54} />
              Hold to Record
            </button>
          ) : (
            <div className="voice-player">
              <button type="button" onClick={playVoiceRecording} disabled={!voicePreviewUrl}>
                <Play size={18} /> Playback
              </button>
              <button type="button" onClick={resetRecording}><Trash2 size={18} /> Delete & Redo</button>
              {voicePreviewUrl ? (
                <audio
                  className="voice-preview"
                  controls
                  ref={audioPreviewRef}
                  src={voicePreviewUrl}
                >
                  <track kind="captions" />
                </audio>
              ) : null}
            </div>
          )}
          <div className={`waveform ${isRecording ? "waveform-active" : ""}`} aria-hidden="true">
            {Array.from({ length: 20 }).map((_, index) => <span key={index} />)}
          </div>
          {/* Timer — turns amber and shows countdown warning in last 10 seconds */}
          <strong className={`timer${voiceCountdownWarning ? " timer-warning" : ""}`}>
            {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, "0")}
          </strong>
          {voiceCountdownWarning ? (
            <p className="voice-countdown-warning" role="alert">
              <AlertTriangle size={14} aria-hidden="true" />
              Recording auto-stops in {recordingSeconds}s
            </p>
          ) : null}
          {voiceStatus ? <p className="hint">{voiceStatus}</p> : null}
          {voiceAttached ? <p className="attached-note"><CheckCircle2 size={16} /> Voice note attached</p> : null}
        </article>
      </div>

      <div className="checkout-grid">
        <article className="medicine-panel">
          <h2>Checkout basket</h2>
          {cart.length ? (
            <>
              {cart.map((item) => {
                const unitPrice = moneyValue(item.customerPrice);
                const lineTotal = unitPrice * (Number(item.quantity) || 0);
                return (
                  <div className="cart-line" key={item.id}>
                    <div className="cart-line-main">
                      <strong>{item.name}</strong>
                      {item.lockedPharmacyName ? (
                        <small>Offer locked with {item.lockedPharmacyName}</small>
                      ) : null}
                    </div>
                    <div className="cart-line-actions">
                      <label>
                        Qty
                        <input
                          min="1"
                          type="number"
                          value={item.quantity}
                          onChange={(event) => updateCartQuantity(item.id, event.target.value)}
                        />
                      </label>
                      <span>
                        {item.metric}
                        {item.customerPrice ? ` • ₹${formatMoney(unitPrice)} each` : ""}
                      </span>
                      {item.customerPrice ? <strong className="cart-line-total">₹{formatMoney(lineTotal)}</strong> : null}
                      <button className="icon-text-button danger-text-button" type="button" onClick={() => removeCartItem(item.id)}>
                        <Trash2 size={16} />
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
              {/* Basket total — always shown when cart has items */}
              <div className="basket-total-row">
                <span>Bucket total</span>
                {basketTotal > 0 ? (
                  <strong>₹{formatMoney(basketTotal)}</strong>
                ) : (
                  <strong className="basket-total-pending">₹ — (price set by pharmacy)</strong>
                )}
              </div>
            </>
          ) : <p>No typed medicines added yet.</p>}

          {/* Save draft button */}
          {cart.length > 0 ? (
            <div className="draft-save-row">
              <button className="button button-secondary" type="button" onClick={saveDraft}>
                <Save size={16} />
                Save draft
              </button>
              {draftSaved ? (
                <span className="draft-saved-note">
                  <CheckCircle2 size={14} />
                  Draft saved (medicines only — files not included)
                </span>
              ) : null}
            </div>
          ) : null}
        </article>

        <article className="medicine-panel pharmacy-selection-panel">
          <h2>Choose pharmacy</h2>
          <label className="address-selector">
            Delivery address
            <select
              disabled={!savedDeliveryAddresses.length}
              value={selectedAddressId}
              onChange={(event) => {
                setSelectedAddressId(event.target.value);
                setManualRadiusKm(5);
              }}
            >
              {savedDeliveryAddresses.map((address) => (
                <option key={address.address_id} value={address.address_id}>
                  {address.label}
                </option>
              ))}
            </select>
          </label>
          {selectedAddress ? (
            <div className="selected-address-card">
              <strong>{selectedAddress.label}</strong>
              <span>{selectedAddress.address_line_1}</span>
              {selectedAddress.landmark ? <span>Landmark: {selectedAddress.landmark}</span> : null}
            </div>
          ) : null}
          {addressStatus ? <p className="hint">{addressStatus}</p> : null}

          {/* Pharmacy content with loading overlay */}
          <div className={`pharmacy-choice-body${isLoadingPharmacies ? " pharmacy-choice-body-loading" : ""}`}>
            {isLoadingPharmacies ? (
              <div className="pharmacy-loading-overlay">
                <RefreshCw size={20} className="spin" aria-hidden="true" />
                <span>Finding pharmacies…</span>
              </div>
            ) : null}

            {lockedPharmacy ? (
              <div className="locked-pharmacy-card">
                <Lock size={22} aria-hidden="true" />
                <p className="eyebrow">Offer pharmacy locked</p>
                <h3>{lockedPharmacy.store_name}</h3>
                <p>
                  You added a product offer from this pharmacy. This price and stock availability are valid only
                  for this pharmacy, so changing pharmacy is disabled for this bucket.
                </p>
                <p>To choose another pharmacy, remove this bucket item and start a regular medicine order.</p>
                {/* Explicit acknowledgement required before submit */}
                <label className="offer-lock-agreement">
                  <input
                    type="checkbox"
                    checked={offerLockUnderstood}
                    onChange={(event) => setOfferLockUnderstood(event.target.checked)}
                  />
                  <span>I understand that the price and pharmacy are locked for this order.</span>
                </label>
              </div>
            ) : (
              <div className="choice-toggle">
                <label>
                  <input
                    checked={pharmacyChoiceMode === "auto"}
                    onChange={() => setPharmacyChoiceMode("auto")}
                    type="radio"
                  />
                  Auto choose
                  <span>Recommended by app</span>
                </label>
                <label>
                  <input
                    checked={pharmacyChoiceMode === "manual"}
                    onChange={() => {
                      setPharmacyChoiceMode("manual");
                      setManualRadiusKm(5);
                    }}
                    type="radio"
                  />
                  Customer chosen
                  <span>Pick a nearby pharmacy</span>
                </label>
              </div>
            )}
            {pharmacyChoiceMode === "auto" && recommendedPharmacy ? (
              <div className="recommended-card">
                <p className="eyebrow">App recommended</p>
                <h3>{recommendedPharmacy.store_name}</h3>
                <p>{recommendedPharmacy.distance_km} KM away • Score {recommendedPharmacy.recommendation_score}</p>
                <div className="score-grid">
                  <span>{recommendedPharmacy.response_time_minutes}m response</span>
                  <span>{recommendedPharmacy.fill_rate_percent}% fill rate</span>
                  <span>{recommendedPharmacy.rating} rating</span>
                </div>
              </div>
            ) : pharmacyChoiceMode === "auto" && !isLoadingPharmacies ? (
              <p className="hint">No online active pharmacy found within 5 KM of this address.</p>
            ) : null}
            {pharmacyChoiceMode === "manual" ? (
              <>
                <div className="manual-radius-header">
                  <strong>{nearbyPharmacies.length} pharmacies found within {manualRadiusKm} KM</strong>
                  {manualRadiusKm < 15 ? (
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => setManualRadiusKm(15)}
                    >
                      Extend to 15 KM
                    </button>
                  ) : null}
                </div>
                <div className="manual-pharmacy-list">
                  {nearbyPharmacies.length ? nearbyPharmacies
                    .slice()
                    .sort((a, b) => a.distance_km - b.distance_km)
                    .map((pharmacy) => (
                      <label className="pharmacy-choice-row" key={pharmacy.account_id}>
                        <input
                          checked={selectedPharmacyId === pharmacy.account_id}
                          onChange={() => setSelectedPharmacyId(pharmacy.account_id)}
                          type="radio"
                        />
                        <span>
                          <strong>{pharmacy.store_name}</strong>
                          {pharmacy.distance_km} KM • {[pharmacy.city, pharmacy.pincode].filter(Boolean).join(" - ") || "Location details pending"}
                          {pharmacy.is_online === false ? " • Offline" : ""}
                        </span>
                      </label>
                    )) : (
                      <p className="hint">No online listed pharmacy found within {manualRadiusKm} KM of this address.</p>
                    )}
                </div>
              </>
            ) : null}
          </div>

          {selectedPharmacy ? (
            <p className={hasExceededPharmacyDistance ? "distance-warning" : "attached-note"}>
              Selected: {selectedPharmacy.store_name}
              {selectedPharmacyDistanceKm !== null ? ` • ${selectedPharmacyDistanceKm.toFixed(1)} KM from delivery address` : ""}
            </p>
          ) : null}

          {/* Distance unknown inline alert */}
          {selectedPharmacy && selectedPharmacyDistanceKm === null && !isLoadingPharmacies ? (
            <div className="checkout-alert" role="alert">
              <AlertTriangle size={18} />
              <span>Unable to calculate distance to this pharmacy. Try selecting a different address or refreshing pharmacy options.</span>
            </div>
          ) : null}

          {hasExceededPharmacyDistance ? (
            <div className="checkout-alert" role="alert">
              <AlertTriangle size={18} />
              <span>
                This pharmacy is beyond the {MAX_PHARMACY_DISTANCE_KM} KM service threshold. Choose another pharmacy or delivery address.
              </span>
            </div>
          ) : null}
          {isSelectedPharmacyOffline ? (
            <div className="checkout-alert" role="alert">
              <AlertTriangle size={18} />
              <span>This pharmacy is offline and can't take any order right now. Please choose another pharmacy or use auto choose.</span>
            </div>
          ) : null}
        </article>

        {!isLockedOfferOrder ? (
          <article className="medicine-panel">
            <h2>Inventory protection</h2>
            <label className="switch-row">
              <input checked={inventoryProtection} onChange={(event) => setInventoryProtection(event.target.checked)} type="checkbox" />
              ENABLED: If an item is out-of-stock at Shop A, fetch it from Shop B so my order gets fulfilled.
            </label>
            <p className="hint">This will ensure maximum order fulfilment.</p>
          </article>
        ) : null}

        <article className="medicine-panel">
          <h2>Medicine substitution</h2>
          <p className="hint">If a medicine in your order is out of stock, can the pharmacy suggest an alternative?</p>
          <div className="substitution-order-choice">
            <label className="substitution-order-option substitution-order-option-yes">
              <input
                type="radio"
                checked={substitutionAllowed === true}
                onChange={() => setSubstitutionAllowed(true)}
              />
              <span>
                <strong>Yes, allow alternative</strong>
                <small>Pharmacy can suggest a substitute</small>
              </span>
            </label>
            <label className="substitution-order-option substitution-order-option-no">
              <input
                type="radio"
                checked={substitutionAllowed === false}
                onChange={() => setSubstitutionAllowed(false)}
              />
              <span>
                <strong>No, keep original only</strong>
                <small>Cancel if exact medicine not available</small>
              </span>
            </label>
          </div>
        </article>

        <article className="medicine-panel">
          {!isLockedOfferOrder ? (
            <>
              <h2>Billing mode</h2>
              <label className="radio-row">
                <input checked={billingMode === "auto"} onChange={() => setBillingMode("auto")} type="radio" />
                Auto-Approval with 2-minute review window
              </label>
              <label className="radio-row">
                <input checked={billingMode === "manual"} onChange={() => setBillingMode("manual")} type="radio" />
                Manual Review with 5-minute authorization window
              </label>
            </>
          ) : (
            <>
              <h2>Offer order review</h2>
              <p className="locked-offer-note">
                This bucket contains a pharmacy-specific product offer. The pharmacy and offer price are locked,
                and the order gets a 2-minute customer cancellation window from the order placed time.
              </p>
            </>
          )}
          <label className="restricted-agreement">
            <input
              checked={restrictedDrugNoticeAccepted}
              onChange={(event) => setRestrictedDrugNoticeAccepted(event.target.checked)}
              type="checkbox"
            />
            <span>
              <strong>I agree with the restricted drug notice.</strong>
              If this order contains controlled substances or narcotics, I will surrender the physical paper
              prescription to the delivery courier at my doorstep.
            </span>
          </label>
          {submitValidationError ? (
            <div className="checkout-alert" role="alert">
              <AlertTriangle size={18} />
              <span>{submitValidationError}</span>
            </div>
          ) : null}
          <button
            className="button button-full"
            disabled={!canSubmit}
            type="button"
            onClick={openConfirmModal}
          >
            Submit medicine order
          </button>
          {submitError ? <p className="form-message form-message-error">{submitError}</p> : null}
        </article>
      </div>

      {/* ── Camera guide modal ── */}
      {isCameraGuideOpen ? (
        <div className="camera-modal">
          <div className="viewfinder">
            <div className="guide-box" />
            <p>Align prescription edges inside this box. Ensure doctor's signature and stamp are clearly visible.</p>
            <button className="button" type="button" onClick={() => setIsCameraGuideOpen(false)}>
              <PauseCircle size={18} />
              Close viewfinder
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Unsaved draft leave-page modal ── */}
      {showLeaveModal ? (
        <div className="order-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="leave-modal-title">
          <div className="order-modal">
            <h2 id="leave-modal-title">Leave order page?</h2>
            <p>
              You have medicines in your basket that have not been submitted yet.
              If you leave, your progress will be lost — use <strong>Save draft</strong> first to keep your basket.
            </p>
            <div className="order-modal-actions">
              <button className="button" type="button" onClick={() => setShowLeaveModal(false)}>
                Stay on page
              </button>
              <button className="button button-danger-outline" type="button" onClick={confirmLeave}>
                Leave anyway
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Order confirmation modal ── */}
      {showConfirmModal ? (
        <div className="order-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
          <div className="order-modal">
            <h2 id="confirm-modal-title">Confirm medicine order</h2>

            <dl className="confirm-summary">
              <div>
                <dt>Delivery to</dt>
                <dd>
                  <strong>{selectedAddress?.label}</strong>
                  {selectedAddress?.address_line_1 ? ` — ${selectedAddress.address_line_1}` : ""}
                </dd>
              </div>
              <div>
                <dt>Pharmacy</dt>
                <dd>
                  <strong>{selectedPharmacy?.store_name}</strong>
                  {selectedPharmacyDistanceKm !== null
                    ? ` — ${selectedPharmacyDistanceKm.toFixed(1)} KM away`
                    : ""}
                </dd>
              </div>
              <div>
                <dt>Items</dt>
                <dd>{cart.length} item{cart.length !== 1 ? "s" : ""} in basket</dd>
              </div>
              {basketTotal > 0 ? (
                <div>
                  <dt>Basket total</dt>
                  <dd>₹{formatMoney(basketTotal)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Substitution</dt>
                <dd>{substitutionAllowed ? "Allowed — pharmacy may suggest alternatives" : "Not allowed — cancel if exact medicine unavailable"}</dd>
              </div>
              <div>
                <dt>Billing mode</dt>
                <dd>{effectiveBillingMode === "auto" ? "Auto-approval (2 min review)" : "Manual review (5 min)"}</dd>
              </div>
              <div>
                <dt>Restricted drug notice</dt>
                <dd className="confirm-ack">
                  <CheckCircle2 size={15} aria-hidden="true" />
                  Acknowledged — I will surrender physical prescription if required
                </dd>
              </div>
              {isLockedOfferOrder ? (
                <div>
                  <dt>Offer lock</dt>
                  <dd className="confirm-ack">
                    <CheckCircle2 size={15} aria-hidden="true" />
                    Understood — price and pharmacy are locked
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="order-modal-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setShowConfirmModal(false)}
              >
                Cancel
              </button>
              <button className="button" type="button" onClick={submitOrder}>
                Confirm &amp; submit
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
