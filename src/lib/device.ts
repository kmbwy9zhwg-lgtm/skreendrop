const ADJ = ["Swift", "Quiet", "Brave", "Sunny", "Cosmic", "Lucky", "Quick", "Bright", "Calm", "Bold", "Clever", "Mellow"];
const ANI = ["Otter", "Falcon", "Panda", "Tiger", "Fox", "Wolf", "Koala", "Lynx", "Hawk", "Bear", "Owl", "Seal"];

export function getDeviceName(): string {
  if (typeof window === "undefined") return "Device";
  let name = localStorage.getItem("sd:deviceName");
  if (!name) {
    name = `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${ANI[Math.floor(Math.random() * ANI.length)]}`;
    localStorage.setItem("sd:deviceName", name);
  }
  return name;
}

export function setDeviceName(name: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("sd:deviceName", name);
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "anon";
  let id = localStorage.getItem("sd:deviceId");
  if (!id) {
    id = Math.random().toString(36).slice(2, 12);
    localStorage.setItem("sd:deviceId", id);
  }
  return id;
}

export type DeviceType = "mobile" | "desktop";

export function getDeviceType(): DeviceType {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(ua)
    ? "mobile"
    : "desktop";
}
