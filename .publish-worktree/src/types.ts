export interface StreetLightLocation {
  "原路燈號碼": string;
  "緯度Latitude": string;
  "經度Longitude": string;
  [key: string]: any;
}

export interface RepairRecord {
  "路燈編號": string;
  "通報時間": string;
  "維修情形": string;
  "故障情形": string;
  [key: string]: any;
}

export interface StreetLightData extends StreetLightLocation {
  id: string;
  isUnrepaired: boolean;
  fault: string;
  reportDate?: Date;
  lat: number;
  lng: number;
}
export interface HistoryRecord {
  "時間": string;
  "路燈編號": string;
  "原緯度": string;
  "原經度": string;
  "新緯度": string;
  "新經度": string;
  "操作類型": string;
  "備註"?: string;
  "照片連結"?: string;
}
