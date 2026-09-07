import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Search,
  FileText,
  Users,
  Video,
  MapPin,
  BookOpen,
  Loader2,
  BellRing,
  Plus,
  X,
  Edit2,
  Trash2
} from "lucide-react";
import { GlassCard } from "../../shared/components/GlassCard";

// Assuming API_BASE_URL is available from gameAPI or similar, but for consistency with teacher app, we can just use the proxy or env
import { API_BASE_URL } from "../../shared/utils/gameAPI";

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
  status?: string;
  editable?: boolean;
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
  custom: "#3b82f6", // blue-500
  deadline: "#f59e0b", // amber-500
  exam: "#ef4444", // red-500
  appointment: "#10b981", // emerald-500
  class: "#8b5cf6", // violet-500
  meeting: "#0ea5e9", // sky-500
};

export const StudentCalendar: React.FC = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [notifications, setNotifications] = useState<CalendarNotification[]>([]);
  const [loading, setLoading] = useState(true);
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
        fetch(`${API_BASE_URL}/calendar/events`, { headers }),
        fetch(`${API_BASE_URL}/calendar/notifications`, { headers })
      ]);
      
      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        setEvents(eventsData);
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
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/calendar/events/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.ok) fetchEventsAndNotifications();
    } catch (err) { console.error("Failed to delete event:", err); }
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const startDT = `${newEvent.date}T${newEvent.startTime}:00`;
      const endDT = `${newEvent.date}T${newEvent.endTime}:00`;
      
      let studentEmail = "";
      const storedUser = localStorage.getItem("user");
      if (storedUser) {
        try { studentEmail = JSON.parse(storedUser).email || ""; } catch (err) {}
      }

      const payload = {
        title: newEvent.title,
        description: newEvent.description,
        start_time: startDT,
        end_time: endDT,
        event_type: newEvent.type,
        color: eventTypeColors[newEvent.type] || "#3b82f6",
        location: newEvent.location,
        is_all_day: false,
        student_email: studentEmail,
      };

      const url = editEventId ? `${API_BASE_URL}/calendar/events/${editEventId}` : `${API_BASE_URL}/calendar/events`;
      const method = editEventId ? "PUT" : "POST";
      
      const token = localStorage.getItem("token");
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      
      if (res.ok) {
        setIsModalOpen(false);
        fetchEventsAndNotifications();
      }
    } catch (err) { console.error("Failed to save event:", err); }
  };

  const renderCalendarDays = () => {
    const days = [];
    const todayDate = new Date();
    
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} className="h-24 sm:h-32 p-1 border border-transparent bg-slate-100/50 rounded-xl" />);
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
            isToday ? 'border-blue-500 bg-blue-50' : 
            isSelected ? 'border-slate-300 bg-blue-50/50' : 
            'border-slate-200/80 bg-white/60 hover:bg-slate-100 hover:shadow-sm'
          }`}
        >
          <div className="flex justify-between items-start mb-1">
            <span className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full ${
              isToday ? 'bg-blue-600 text-white shadow-md' : 'text-slate-700'
            }`}>
              {i}
            </span>
            {dayEvents.length > 0 && (
              <span className="text-[10px] font-bold text-slate-500">
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
              <div className="text-[10px] text-slate-600 text-center font-medium">
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
    <div className="space-y-6 animate-fade-in pb-20 text-slate-900">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            My Calendar
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            View your schedule, deadlines, and appointments.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events..."
              className="rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none w-full sm:w-64 bg-white border border-slate-200 text-slate-900 focus:border-blue-500"
            />
          </div>
          <button onClick={openCreateModal} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors">
            <Plus size={16} /> New Event
          </button>
        </div>
      </div>

      {/* Notifications Banner */}
      {notifications.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="bg-blue-100 p-2 rounded-lg text-blue-600 shrink-0">
            <BellRing size={20} className="animate-pulse" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-blue-800">Upcoming Tomorrow ({notifications.length})</h3>
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
          { id: "custom", label: "My Events", color: "#3b82f6" },
          { id: "class", label: "Classes", color: "#8b5cf6" },
          { id: "appointment", label: "Appointments", color: "#10b981" },
          { id: "deadline", label: "Deadlines", color: "#f59e0b" },
          { id: "exam", label: "Exams", color: "#ef4444" },
        ].map(filter => (
          <button
            key={filter.id}
            onClick={() => toggleFilter(filter.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
              activeFilters.has(filter.id) ? 'shadow-sm' : 'opacity-60 bg-transparent border-slate-200'
            }`}
            style={{ 
              backgroundColor: activeFilters.has(filter.id) ? `${filter.color}15` : 'transparent',
              color: activeFilters.has(filter.id) ? filter.color : '#94a3b8',
              borderColor: activeFilters.has(filter.id) ? `${filter.color}40` : '',
            }}
          >
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: filter.color }} />
            {filter.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3 space-y-4">
          <GlassCard className="p-0 overflow-hidden bg-white/70 border-slate-200">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold text-slate-900">
                  {monthNames[month]} {year}
                </h2>
                <div className="flex gap-1">
                  <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-700">
                    <ChevronLeft size={18} />
                  </button>
                  <button onClick={today} className="px-3 py-1.5 rounded-lg hover:bg-slate-100 text-xs font-semibold transition-colors text-slate-700">
                    Today
                  </button>
                  <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-700">
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-4">
              <div className="grid grid-cols-7 gap-2 mb-2">
                {dayNames.map(day => (
                  <div key={day} className="text-center text-xs font-bold uppercase tracking-wider text-slate-600">
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
          <GlassCard padding="none" className="overflow-hidden flex flex-col h-full max-h-[800px] bg-white/70 border-slate-200">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white/90">
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  {selectedDate ? selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : "Select a date"}
                </h3>
                <p className="text-xs mt-0.5 text-slate-500">
                  {selectedDayEvents.length} events scheduled
                </p>
              </div>
            </div>
            
            <div className="p-4 flex-1 overflow-y-auto space-y-3">
              {!selectedDate ? (
                <div className="text-center py-10 text-slate-600">
                  <CalendarIcon size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Click on a day to view its agenda</p>
                </div>
              ) : selectedDayEvents.length === 0 ? (
                <div className="text-center py-10 text-slate-600">
                  <p className="text-sm">No events on this day.</p>
                </div>
              ) : (
                selectedDayEvents.sort((a: CalendarEvent, b: CalendarEvent) => new Date(a.start).getTime() - new Date(b.start).getTime()).map((ev: CalendarEvent) => (
                  <div key={ev.id} className="p-3 rounded-xl border border-slate-200 relative overflow-hidden bg-white/90 group">
                    <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: eventTypeColors[ev.type.toLowerCase()] || ev.color }} />
                    <div className="pl-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1" style={{ color: eventTypeColors[ev.type.toLowerCase()] || ev.color }}>
                          {eventTypeIcons[ev.type.toLowerCase()] || eventTypeIcons["custom"]} {ev.type}
                        </span>
                        <span className="text-xs font-semibold text-slate-500">
                          {new Date(ev.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold leading-tight pr-2 text-slate-900">{ev.title}</h4>
                      {ev.description && (
                        <p className="text-xs mt-1 line-clamp-2 text-slate-500">{ev.description}</p>
                      )}
                      {ev.location && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
                          <MapPin size={12} /> {ev.location}
                        </div>
                      )}
                      
                      {ev.source === "custom" && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => { e.stopPropagation(); openEditModal(ev); }}
                            className="p-1.5 bg-slate-100 text-blue-600 rounded-md hover:bg-slate-200 transition-colors"
                            title="Edit Event"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDeleteEvent(ev.raw_id); }}
                            className="p-1.5 bg-slate-100 text-red-600 rounded-md hover:bg-slate-200 transition-colors"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-sm">
          <GlassCard className="w-full max-w-md animate-fade-in-up p-0 overflow-hidden bg-white border-slate-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-white/90">
              <h2 className="font-bold flex items-center gap-2 text-slate-900">
                {editEventId ? <Edit2 size={18} className="text-blue-500" /> : <Plus size={18} className="text-blue-500" />}
                {editEventId ? "Edit Event" : "Create Event"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-500">
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
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-500"
                  placeholder="e.g. Study Session"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Type</label>
                  <select 
                    value={newEvent.type}
                    onChange={e => setNewEvent({...newEvent, type: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-500"
                  >
                    <option value="custom">General Event</option>
                    <option value="meeting">Study Group</option>
                    <option value="appointment">Tutor Appointment</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Date *</label>
                  <input 
                    required
                    type="date"
                    value={newEvent.date}
                    onChange={e => setNewEvent({...newEvent, date: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-500"
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
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">End Time *</label>
                  <input 
                    required
                    type="time"
                    value={newEvent.endTime}
                    onChange={e => setNewEvent({...newEvent, endTime: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Location / Link</label>
                <input 
                  value={newEvent.location}
                  onChange={e => setNewEvent({...newEvent, location: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-500"
                  placeholder="e.g. Library Room 3 or Zoom Link"
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Description</label>
                <textarea 
                  value={newEvent.description}
                  onChange={e => setNewEvent({...newEvent, description: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-500 min-h-[80px]"
                  placeholder="Optional details..."
                />
              </div>
              
              <div className="pt-4 flex justify-end gap-3 border-t border-slate-200">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-lg shadow-blue-500/20 transition-all"
                >
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
