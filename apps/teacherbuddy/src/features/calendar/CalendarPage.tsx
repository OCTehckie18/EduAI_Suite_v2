import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  X,
  FileText,
  Users,
  Video,
  MapPin,
  BookOpen,
  Loader2,
  Trash2,
  Edit2,
  BellRing,
  RefreshCw,
  Cloud
} from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";

import { API_ENDPOINTS } from "../../shared/utils/apiConfig";

const API_URL = API_ENDPOINTS.BASE;
const GOOGLE_CALENDAR_UI_ENABLED = false;

type CalendarEvent = {
  id: string;
  raw_id: number;
  title: string;
  description: string;
  start: string;
  end: string;
  type: string;
  color: string;
  location: string;
  is_all_day: boolean;
  source: string;
  editable: boolean;
  status?: string;
};

type CalendarNotification = {
  id: string;
  title: string;
  start: string;
  type: string;
  color: string;
  source: string;
  message: string;
};

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

const toLocalISODate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const eventTypeIcons: Record<string, React.ReactNode> = {
  custom: <CalendarIcon size={14} />,
  deadline: <FileText size={14} />,
  exam: <FileText size={14} />,
  appointment: <Users size={14} />,
  class: <BookOpen size={14} />,
  meeting: <Video size={14} />,
};

const eventTypeColors: Record<string, string> = {
  custom: "#264796",
  deadline: "#d97706",
  exam: "#dc2626",
  appointment: "#16a34a",
  class: "#7c3aed",
  meeting: "#2563eb",
};

export const CalendarPage: React.FC = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [notifications, setNotifications] = useState<CalendarNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleSyncing, setGoogleSyncing] = useState(false);
  const [googleMessage, setGoogleMessage] = useState("");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(["custom", "deadline", "exam", "appointment", "class"]));
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editEventId, setEditEventId] = useState<number | null>(null);
  const [newEvent, setNewEvent] = useState({
    title: "",
    description: "",
    date: "",
    startTime: "",
    endTime: "",
    type: "custom",
    location: "",
  });

  const fetchEventsAndNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

      const [eventsRes, notificationsRes] = await Promise.all([
        fetch(`${API_ENDPOINTS.CALENDAR}/events`, { headers }),
        fetch(`${API_ENDPOINTS.CALENDAR}/notifications`, { headers })
      ]);
      
      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setEvents(data);
      }
      
      if (notificationsRes.ok) {
        const notifData = await notificationsRes.json();
        setNotifications(notifData.notifications || []);
      }
    } catch (err) {
      console.error("Failed to fetch calendar data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEventsAndNotifications();
  }, [fetchEventsAndNotifications]);

  const fetchGoogleStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_ENDPOINTS.CALENDAR}/google-status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (response.ok) setGoogleConnected((await response.json()).connected === true);
    } catch (err) {
      console.error("Failed to fetch Google Calendar status:", err);
    }
  }, []);

  useEffect(() => {
    fetchGoogleStatus();
    if (new URLSearchParams(window.location.search).get("google_calendar") === "connected") {
      setGoogleMessage("Google Calendar connected. You can sync your events now.");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [fetchGoogleStatus]);

  const syncGoogleCalendar = async () => {
    setGoogleMessage("");
    if (!googleConnected) {
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(`${API_ENDPOINTS.AUTH}/google-calendar/connect`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Google Calendar is unavailable");
        window.location.assign(data.authorization_url);
      } catch (err) {
        setGoogleMessage(err instanceof Error ? err.message : "Unable to connect Google Calendar");
      }
      return;
    }

    setGoogleSyncing(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_ENDPOINTS.CALENDAR}/sync-google`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Google Calendar sync failed");
      setGoogleMessage(`Synced ${data.imported || 0} from Google and ${data.exported || 0} to Google.`);
      await fetchEventsAndNotifications();
    } catch (err) {
      setGoogleMessage(err instanceof Error ? err.message : "Google Calendar sync failed");
    } finally {
      setGoogleSyncing(false);
    }
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfMonth = getFirstDayOfMonth(year, month);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const today = () => setCurrentDate(new Date());

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const toggleFilter = (type: string) => {
    const newFilters = new Set(activeFilters);
    if (newFilters.has(type)) {
      newFilters.delete(type);
    } else {
      newFilters.add(type);
    }
    setActiveFilters(newFilters);
  };

  const filteredEvents = useMemo(() => {
    let filtered = events.filter(e => activeFilters.has(e.type === "custom" ? "custom" : e.type));
    
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(e => 
        e.title.toLowerCase().includes(q) || 
        e.description.toLowerCase().includes(q)
      );
    }
    
    return filtered;
  }, [events, activeFilters, search]);

  const eventsByDate = useMemo(() => {
    const map: Map<string, CalendarEvent[]> = new Map();
    filteredEvents.forEach((event: CalendarEvent) => {
      const dateStr = event.start.split('T')[0];
      if (!map.has(dateStr)) map.set(dateStr, []);
      map.get(dateStr)!.push(event);
    });
    return map;
  }, [filteredEvents]);

  const openCreateModal = () => {
    const d = new Date();
    setEditEventId(null);
    setNewEvent({
      title: "",
      description: "",
      date: toLocalISODate(d),
      startTime: `${String(d.getHours()).padStart(2, '0')}:00`,
      endTime: `${String((d.getHours() + 1) % 24).padStart(2, '0')}:00`,
      type: "custom",
      location: ""
    });
    setIsModalOpen(true);
  };

  const openEditModal = (event: CalendarEvent) => {
    if (!event.editable) return;
    
    const startDate = new Date(event.start);
    const endDate = new Date(event.end);
    
    setEditEventId(event.raw_id);
    setNewEvent({
      title: event.title,
      description: event.description || "",
      date: event.start.split('T')[0],
      startTime: `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`,
      endTime: `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`,
      type: event.type,
      location: event.location || ""
    });
    setIsModalOpen(true);
  };

  const handleDeleteEvent = async (id: number) => {
    if (!confirm("Are you sure you want to delete this event?")) return;
    
    try {
      const res = await fetch(`${API_ENDPOINTS.CALENDAR}/events/${id}`, {
        method: "DELETE",
        headers: localStorage.getItem("token")
          ? { Authorization: `Bearer ${localStorage.getItem("token")}` }
          : undefined,
      });
      
      if (res.ok) {
        fetchEventsAndNotifications();
      }
    } catch (err) {
      console.error("Failed to delete event:", err);
    }
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const startDT = `${newEvent.date}T${newEvent.startTime}:00`;
      const endDT = `${newEvent.date}T${newEvent.endTime}:00`;
      
      const storedUser = localStorage.getItem("user");
      let teacherName = "";
      if (storedUser) {
        try { teacherName = JSON.parse(storedUser).name || ""; } catch (err) {}
      }

      const payload = {
        title: newEvent.title,
        description: newEvent.description,
        start_time: startDT,
        end_time: endDT,
        event_type: newEvent.type,
        color: eventTypeColors[newEvent.type] || "#264796",
        location: newEvent.location,
        is_all_day: false,
        teacher_name: teacherName,
      };

      const url = editEventId 
        ? `${API_ENDPOINTS.CALENDAR}/events/${editEventId}`
        : `${API_ENDPOINTS.CALENDAR}/events`;
        
      const method = editEventId ? "PUT" : "POST";
      
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(localStorage.getItem("token")
            ? { Authorization: `Bearer ${localStorage.getItem("token")}` }
            : {}),
        },
        body: JSON.stringify(payload),
      });
      
      if (res.ok) {
        setIsModalOpen(false);
        fetchEventsAndNotifications();
      }
    } catch (err) {
      console.error("Failed to save event:", err);
    }
  };

  const renderCalendarDays = () => {
    const days = [];
    const todayDate = new Date();
    
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} className="h-24 sm:h-32 p-1 border border-transparent bg-slate-50/50 dark:bg-slate-800/20 rounded-xl" />);
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      const dateStr = toLocalISODate(date);
      const dayEvents = eventsByDate.get(dateStr) || [];
      const isToday = i === todayDate.getDate() && month === todayDate.getMonth() && year === todayDate.getFullYear();
      const isSelected = selectedDate ? toLocalISODate(selectedDate) === dateStr : false;
      
      days.push(
        <div 
          key={i} 
          onClick={() => setSelectedDate(date)}
          className={`h-24 sm:h-32 p-2 border rounded-xl overflow-hidden cursor-pointer transition-all ${
            isToday ? 'border-blue-500 bg-blue-50/30' : 
            isSelected ? 'border-slate-400 bg-slate-100/50' : 
            'border-slate-200/60 bg-white/40 hover:bg-white hover:shadow-sm'
          }`}
        >
          <div className="flex justify-between items-start mb-1">
            <span className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full ${
              isToday ? 'bg-blue-600 text-white shadow-md' : 'text-slate-700'
            }`}>
              {i}
            </span>
            {dayEvents.length > 0 && (
              <span className="text-[10px] font-bold text-slate-400">
                {dayEvents.length} events
              </span>
            )}
          </div>
          
          <div className="space-y-1 overflow-y-auto max-h-[calc(100%-1.75rem)] scrollbar-hide">
            {dayEvents.slice(0, 3).map((ev: CalendarEvent, idx: number) => (
              <div 
                key={idx} 
                className="text-[10px] px-1.5 py-0.5 rounded truncate border"
                style={{ 
                  backgroundColor: `${eventTypeColors[ev.type.toLowerCase()] || ev.color}15`, 
                  color: eventTypeColors[ev.type.toLowerCase()] || ev.color,
                  borderColor: `${eventTypeColors[ev.type.toLowerCase()] || ev.color}30`
                }}
                title={ev.title}
              >
                {new Date(ev.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {ev.title}
              </div>
            ))}
            {dayEvents.length > 3 && (
              <div className="text-[10px] text-slate-500 text-center font-medium">
                +{dayEvents.length - 3} more
              </div>
            )}
          </div>
        </div>
      );
    }
    
    return days;
  };

  const selectedDayEvents = selectedDate 
    ? (eventsByDate.get(toLocalISODate(selectedDate)) || [])
    : [];

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
            Academic Calendar
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Manage your schedule, deadlines, and appointments in one place.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {GOOGLE_CALENDAR_UI_ENABLED && (
            <button onClick={syncGoogleCalendar} className="btn btn-outline" disabled={googleSyncing}>
              {googleSyncing ? <RefreshCw size={16} className="animate-spin" /> : <Cloud size={16} />}
              {googleConnected ? "Sync Google Calendar" : "Connect Google Calendar"}
            </button>
          )}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--color-text-muted)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events..."
              className="rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none w-full sm:w-64"
              style={{ background: "var(--color-surface-base)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
            />
          </div>
          <button onClick={openCreateModal} className="btn btn-primary">
            <Plus size={16} /> New Event
          </button>
        </div>
      </div>

      {googleMessage && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {googleMessage}
        </div>
      )}

      {/* Notifications Banner */}
      {notifications.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="bg-blue-100 p-2 rounded-lg text-blue-600 shrink-0">
            <BellRing size={20} className="animate-pulse" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-blue-900">Upcoming Tomorrow ({notifications.length})</h3>
            <div className="mt-1 flex flex-wrap gap-2">
              {notifications.map((notif, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border"
                      style={{ 
                        backgroundColor: `${eventTypeColors[notif.type.toLowerCase()] || notif.color}15`, 
                        color: eventTypeColors[notif.type.toLowerCase()] || notif.color, 
                        borderColor: `${eventTypeColors[notif.type.toLowerCase()] || notif.color}30` 
                      }}>
                  {notif.message}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
        {[
          { id: "custom", label: "My Events", color: "#264796" },
          { id: "class", label: "Classes", color: "#7c3aed" },
          { id: "appointment", label: "Appointments", color: "#16a34a" },
          { id: "deadline", label: "Deadlines", color: "#d97706" },
          { id: "exam", label: "Exams", color: "#dc2626" },
        ].map(filter => (
          <button
            key={filter.id}
            onClick={() => toggleFilter(filter.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
              activeFilters.has(filter.id) ? 'shadow-sm' : 'opacity-60 bg-transparent'
            }`}
            style={{ 
              backgroundColor: activeFilters.has(filter.id) ? `${filter.color}15` : 'transparent',
              color: activeFilters.has(filter.id) ? filter.color : 'var(--color-text-muted)',
              borderColor: activeFilters.has(filter.id) ? `${filter.color}40` : 'var(--color-border)',
            }}
          >
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: filter.color }} />
            {filter.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3 space-y-4">
          <GlassCard className="p-0 overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: "var(--color-border)" }}>
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
                  {monthNames[month]} {year}
                </h2>
                <div className="flex gap-1">
                  <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                    <ChevronLeft size={18} />
                  </button>
                  <button onClick={today} className="px-3 py-1.5 rounded-lg hover:bg-slate-100 text-xs font-semibold transition-colors">
                    Today
                  </button>
                  <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-4">
              <div className="grid grid-cols-7 gap-2 mb-2">
                {dayNames.map(day => (
                  <div key={day} className="text-center text-xs font-bold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                    {day}
                  </div>
                ))}
              </div>
              
              {loading ? (
                <div className="h-96 flex items-center justify-center">
                  <Loader2 className="animate-spin text-blue-500" size={32} />
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-2">
                  {renderCalendarDays()}
                </div>
              )}
            </div>
          </GlassCard>
        </div>

        <div className="space-y-4">
          <GlassCard padding="none" className="overflow-hidden flex flex-col h-full max-h-[800px]">
            <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: "var(--color-border)", background: "var(--color-bg-grad1)" }}>
              <div>
                <h3 className="font-bold text-sm" style={{ color: "var(--color-text-primary)" }}>
                  {selectedDate ? selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : "Select a date"}
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  {selectedDayEvents.length} events scheduled
                </p>
              </div>
            </div>
            
            <div className="p-4 flex-1 overflow-y-auto space-y-3">
              {!selectedDate ? (
                <div className="text-center py-10 text-slate-400">
                  <CalendarIcon size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Click on a day to view its agenda</p>
                </div>
              ) : selectedDayEvents.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <p className="text-sm">No events on this day.</p>
                </div>
              ) : (
                selectedDayEvents.sort((a: CalendarEvent, b: CalendarEvent) => new Date(a.start).getTime() - new Date(b.start).getTime()).map((ev: CalendarEvent) => (
                  <div key={ev.id} className="p-3 rounded-xl border relative overflow-hidden group" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-base)" }}>
                    <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: eventTypeColors[ev.type.toLowerCase()] || ev.color }} />
                    <div className="pl-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1" style={{ color: eventTypeColors[ev.type.toLowerCase()] || ev.color }}>
                          {eventTypeIcons[ev.type.toLowerCase()] || eventTypeIcons["custom"]} {ev.type}
                        </span>
                        <span className="text-xs font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                          {new Date(ev.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold leading-tight pr-12" style={{ color: "var(--color-text-primary)" }}>{ev.title}</h4>
                      {ev.description && (
                        <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--color-text-muted)" }}>{ev.description}</p>
                      )}
                      {ev.location && (
                        <div className="flex items-center gap-1 mt-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                          <MapPin size={12} /> {ev.location}
                        </div>
                      )}
                      
                      {ev.editable && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => { e.stopPropagation(); openEditModal(ev); }}
                            className="p-1.5 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors"
                            title="Edit Event"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDeleteEvent(ev.raw_id); }}
                            className="p-1.5 bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors"
                            title="Delete Event"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Edit/Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <GlassCard className="w-full max-w-md animate-fade-in-up p-0 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "var(--color-border)", background: "var(--color-bg-grad1)" }}>
              <h2 className="font-bold flex items-center gap-2">
                {editEventId ? <Edit2 size={18} className="text-blue-600" /> : <Plus size={18} className="text-blue-600" />}
                {editEventId ? "Edit Event" : "Create Event"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-1 hover:bg-slate-200 rounded-lg text-slate-500">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleSaveEvent} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Event Title *</label>
                <input 
                  required
                  value={newEvent.title}
                  onChange={e => setNewEvent({...newEvent, title: e.target.value})}
                  className="form-input"
                  placeholder="e.g. Department Meeting"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Type</label>
                  <select 
                    value={newEvent.type}
                    onChange={e => setNewEvent({...newEvent, type: e.target.value})}
                    className="form-input"
                  >
                    <option value="custom">General Event</option>
                    <option value="meeting">Meeting</option>
                    <option value="class">Class Activity</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Date *</label>
                  <input 
                    required
                    type="date"
                    value={newEvent.date}
                    onChange={e => setNewEvent({...newEvent, date: e.target.value})}
                    className="form-input"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Start Time *</label>
                  <input 
                    required
                    type="time"
                    value={newEvent.startTime}
                    onChange={e => setNewEvent({...newEvent, startTime: e.target.value})}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">End Time *</label>
                  <input 
                    required
                    type="time"
                    value={newEvent.endTime}
                    onChange={e => setNewEvent({...newEvent, endTime: e.target.value})}
                    className="form-input"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Location</label>
                <input 
                  value={newEvent.location}
                  onChange={e => setNewEvent({...newEvent, location: e.target.value})}
                  className="form-input"
                  placeholder="Room, Link, etc."
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Description</label>
                <textarea 
                  value={newEvent.description}
                  onChange={e => setNewEvent({...newEvent, description: e.target.value})}
                  className="form-input resize-none"
                  rows={2}
                  placeholder="Optional details..."
                />
              </div>
              
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-outline flex-1">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  {editEventId ? "Save Changes" : "Create Event"}
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}
    </div>
  );
};
