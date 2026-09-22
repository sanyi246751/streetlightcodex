/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import StreetLightMap from './components/StreetLightMap';
import ReplaceLightView from './components/ReplaceLightView';
import RepairReportView from './components/RepairReportView';
import BaseSurveyView from './components/BaseSurveyView';
import AdminDatabaseView from './components/AdminDatabaseView';
import { StreetLightData } from './types';
import { MapPin, Wrench, Settings, ClipboardCheck } from 'lucide-react';

export type UserRole = 'officer' | 'maintenance' | 'admin' | 'survey' | null;

const ROLE_ROUTES = ['officer', 'maintenance', 'survey', 'admin'] as const;

function getRoleFromUrl(): UserRole {
  const hashRoute = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  if (ROLE_ROUTES.includes(hashRoute as Exclude<UserRole, null>)) {
    return hashRoute as Exclude<UserRole, null>;
  }

  // 相容舊版分享出去的 ?role=... 網址。
  const legacyRole = new URLSearchParams(window.location.search).get('role');
  if (ROLE_ROUTES.includes(legacyRole as Exclude<UserRole, null>)) {
    return legacyRole as Exclude<UserRole, null>;
  }

  return null;
}

export default function App() {
  console.log("[App] Component initialized");
  const [role, setRole] = useState<UserRole>(null);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [currentPage, setCurrentPage] = useState<'map' | 'replace' | 'report' | 'survey' | 'database'>('map');
  const [lights, setLights] = useState<StreetLightData[]>([]);
  const [villageData, setVillageData] = useState<any>(null);

  // 從環境變數讀取密碼，上傳 GitHub 時才不會被別人看到
  const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || "chi0720";

  useEffect(() => {
    // GitHub Pages 子路徑由 Vite 的 BASE_URL 提供。
    const baseUrl = import.meta.env.BASE_URL || '/';
    const geojsonUrl = `${baseUrl}/data/Sanyi_villages.geojson`.replace(/\/+/g, '/');

    console.log("[App] Attempting to fetch village data from:", geojsonUrl);

    fetch(geojsonUrl)
      .then(res => {
        console.log("[App] Fetch response status:", res.status, res.statusText);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText} at ${geojsonUrl}`);
        }
        return res.json();
      })
      .then(data => {
        if (data && data.features) {
          console.log("[App] Village data loaded! Features:", data.features.length);
          setVillageData(data);
        } else {
          console.error("[App] Invalid GeoJSON format:", data);
        }
      })
      .catch(err => {
        console.error("[App] CRITICAL: Failed to load village data!", err);
        // 如果載入失敗，提供一個後門或警告，讓開發者知道是檔案路徑問題
        if (window.location.hostname === 'localhost') {
          console.warn("[App] TIP: On localhost, make sure public/data/Sanyi_villages.geojson exists.");
        }
      });

    const syncRoleFromUrl = () => {
      const roleFromUrl = getRoleFromUrl();

      if (roleFromUrl === 'admin') {
        const savedAuth = localStorage.getItem('sanyi_admin_auth');
        if (savedAuth !== ADMIN_PASSWORD) {
          setRole(null);
          setCurrentPage('map');
          window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
          return;
        }
        setIsAdminAuthenticated(true);
      }

      setRole(roleFromUrl);
      setCurrentPage(roleFromUrl === 'survey' ? 'survey' : 'map');

      // 舊版 query string 自動轉成新的獨立頁面網址。
      if (roleFromUrl && !window.location.hash) {
        const url = new URL(window.location.href);
        url.searchParams.delete('role');
        url.hash = `/${roleFromUrl}`;
        window.history.replaceState({}, '', url);
      }
    };

    syncRoleFromUrl();
    window.addEventListener('hashchange', syncRoleFromUrl);
    window.addEventListener('popstate', syncRoleFromUrl);

    return () => {
      window.removeEventListener('hashchange', syncRoleFromUrl);
      window.removeEventListener('popstate', syncRoleFromUrl);
    };
  }, []);

  // 處理身分選擇並更新網址
  const handleRoleSelect = (selectedRole: UserRole) => {
    if (selectedRole === 'admin') {
      const password = prompt("請輸入管理單位專屬密碼：");
      if (password !== ADMIN_PASSWORD) {
        alert("密碼錯誤，拒絕存取管理系統！");
        return;
      }
      setIsAdminAuthenticated(true);
      localStorage.setItem('sanyi_admin_auth', ADMIN_PASSWORD);
    }

    if (selectedRole) {
      window.location.hash = `/${selectedRole}`;
    }
  };

  // 如果還沒設定身分，就顯示選單
  if (role === null) {
    return (
      <div className="h-screen w-screen bg-[#FFF9F2] flex flex-col items-center justify-center p-6 text-slate-700 font-sans">
        <h1 className="text-3xl font-extrabold text-[#FF8C69] mb-8">三義鄉公所路燈系統</h1>
        <div className="flex flex-col gap-4 w-full max-w-sm">

          <a
            href="#/officer"
            onClick={() => handleRoleSelect('officer')}
            className="bg-white p-5 rounded-[2rem] shadow-sm hover:shadow-md border-2 border-slate-100 flex items-center gap-4 transition-all active:scale-95"
          >
            <div className="p-3 bg-sky-100 text-sky-500 rounded-2xl"><MapPin className="w-8 h-8" /></div>
            <div className="text-left flex-1">
              <div className="text-xl font-bold">承辦人員</div>
              <div className="text-sm text-slate-400 font-medium">路燈編號查詢系統、查看待修清單、路燈通報系統</div>
            </div>
          </a>

          <a
            href="#/maintenance"
            onClick={() => handleRoleSelect('maintenance')}
            className="bg-white p-5 rounded-[2rem] shadow-sm hover:shadow-md border-2 border-slate-100 flex items-center gap-4 transition-all active:scale-95"
          >
            <div className="p-3 bg-emerald-100 text-emerald-500 rounded-2xl"><Wrench className="w-8 h-8" /></div>
            <div className="text-left flex-1">
              <div className="text-xl font-bold">維修人員</div>
              <div className="text-sm text-slate-400 font-medium">查看待修清單、路燈編號查詢系統、維修回報系統</div>
            </div>
          </a>

          <a
            href="#/survey"
            onClick={() => handleRoleSelect('survey')}
            className="bg-white p-5 rounded-[2rem] shadow-sm hover:shadow-md border-2 border-slate-100 flex items-center gap-4 transition-all active:scale-95"
          >
            <div className="p-3 bg-purple-100 text-purple-600 rounded-2xl"><ClipboardCheck className="w-8 h-8" /></div>
            <div className="text-left flex-1">
              <div className="text-xl font-bold">路燈基座調查</div>
              <div className="text-sm text-slate-400 font-medium">基座調查系統</div>
            </div>
          </a>

          <a
            href="#/admin"
            onClick={(event) => {
              event.preventDefault();
              handleRoleSelect('admin');
            }}
            className="bg-white p-5 rounded-[2rem] shadow-sm hover:shadow-md border-2 border-slate-100 flex items-center gap-4 transition-all active:scale-95"
          >
            <div className="p-3 bg-orange-100 text-[#FF8C69] rounded-2xl"><Settings className="w-8 h-8" /></div>
            <div className="text-left flex-1">
              <div className="text-xl font-bold">管理單位</div>
              <div className="text-sm text-slate-400 font-medium">全部</div>
            </div>
          </a>

        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden">
      {currentPage === 'map' ? (
        <StreetLightMap
          villageData={villageData}
          role={role}
          onNavigateToReplace={(data) => {
            if (role === 'admin') {
              setLights(data);
              setCurrentPage('replace');
            }
          }}
          onNavigateToReport={() => setCurrentPage('report')}
          onNavigateToSurvey={() => setCurrentPage('survey')}
          onNavigateToDatabase={() => role === 'admin' && setCurrentPage('database')}
        />
      ) : currentPage === 'replace' ? (
        <ReplaceLightView
          lights={lights}
          villageData={villageData}
          onBack={() => setCurrentPage('map')}
        />
      ) : currentPage === 'survey' ? (
        <BaseSurveyView
          onBack={() => setCurrentPage('map')}
        />
      ) : currentPage === 'database' ? (
        <AdminDatabaseView onBack={() => setCurrentPage('map')} />
      ) : (
        <RepairReportView
          onBack={() => setCurrentPage('map')}
        />
      )}
    </div>
  );
}
