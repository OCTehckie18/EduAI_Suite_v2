import { useState } from 'react';
import { 
  Building2, 
  Users, 
  Trash2, 
  BarChart3, 
  RefreshCw, 
  Search, 
  Plus, 
  ChevronRight,
  Sparkles,
  GraduationCap
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'campuses' | 'users' | 'recycle_bin'>('overview');
  const [searchQuery, setSearchQuery] = useState('');

  // Sample Master Admin state representing cross-campus data
  const campuses = [
    { id: '1', name: 'Central Campus', code: 'BLR-CEN', schools: 8, departments: 34, students: 12450, status: 'Active' },
    { id: '2', name: 'Kengeri Campus', code: 'BLR-KNG', schools: 4, departments: 16, students: 6200, status: 'Active' },
    { id: '3', name: 'BGR Campus', code: 'BLR-BGR', schools: 3, departments: 12, students: 4800, status: 'Active' },
    { id: '4', name: 'Delhi NCR Campus', code: 'DEL-NCR', schools: 5, departments: 18, students: 3900, status: 'Active' },
    { id: '5', name: 'Pune Lavasa Campus', code: 'PUN-LVS', schools: 3, departments: 9, students: 2400, status: 'Active' },
  ];

  const softDeletedItems = [
    { id: '101', type: 'Classroom', name: 'MCA-2024 Advanced Java', campus: 'Central Campus', deletedAt: '2 hours ago', deletedBy: 'Dr. Alwin Joseph' },
    { id: '102', type: 'Teacher', name: 'Dr. Ramesh Kumar (Emp #4921)', campus: 'Kengeri Campus', deletedAt: '1 day ago', deletedBy: 'Master Admin' },
    { id: '103', type: 'Assignment', name: 'Cloud Computing Lab Assignment 3', campus: 'BGR Campus', deletedAt: '3 days ago', deletedBy: 'Prof. Anita S' },
  ];

  return (
    <div className="flex min-h-screen bg-stone-950 text-stone-100">
      {/* Sidebar Navigation */}
      <aside className="w-72 glass-panel border-r border-stone-800/80 p-6 flex flex-col justify-between">
        <div>
          {/* Brand Logo */}
          <div className="flex items-center gap-3 mb-10">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-900/30">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-white tracking-tight">EduAI Suite</h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase tracking-wider">
                Master Admin
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            <button 
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'overview' 
                  ? 'bg-stone-800 text-white shadow-md border border-stone-700/60' 
                  : 'text-stone-400 hover:text-white hover:bg-stone-900/60'
              }`}
            >
              <BarChart3 className="h-4 w-4 text-amber-400" />
              Overview & Analytics
            </button>

            <button 
              onClick={() => setActiveTab('campuses')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'campuses' 
                  ? 'bg-stone-800 text-white shadow-md border border-stone-700/60' 
                  : 'text-stone-400 hover:text-white hover:bg-stone-900/60'
              }`}
            >
              <Building2 className="h-4 w-4 text-emerald-400" />
              Campus Governance
            </button>

            <button 
              onClick={() => setActiveTab('users')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'users' 
                  ? 'bg-stone-800 text-white shadow-md border border-stone-700/60' 
                  : 'text-stone-400 hover:text-white hover:bg-stone-900/60'
              }`}
            >
              <Users className="h-4 w-4 text-sky-400" />
              Global User Directory
            </button>

            <button 
              onClick={() => setActiveTab('recycle_bin')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                activeTab === 'recycle_bin' 
                  ? 'bg-stone-800 text-white shadow-md border border-stone-700/60' 
                  : 'text-stone-400 hover:text-white hover:bg-stone-900/60'
              }`}
            >
              <Trash2 className="h-4 w-4 text-rose-400" />
              Universal Recycle Bin
              <span className="ml-auto bg-rose-500/20 text-rose-300 text-xs px-2 py-0.5 rounded-full border border-rose-500/30">
                3
              </span>
            </button>
          </nav>
        </div>

        {/* System Health Badge */}
        <div className="glass-card p-4 rounded-xl border border-stone-800/80">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 mb-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Django 5.1 Backend Online
          </div>
          <p className="text-[11px] text-stone-400">PostgreSQL 16 & Redis active</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-8 overflow-y-auto">
        {/* Top Navbar */}
        <header className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white capitalize">
              {activeTab.replace('_', ' ')}
            </h2>
            <p className="text-sm text-stone-400 mt-1">
              Cross-campus administration for Christ University & affiliated centers
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3.5 top-3 text-stone-400" />
              <input 
                type="text" 
                placeholder="Search across all campuses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-stone-900/80 border border-stone-800 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-stone-500 focus:outline-none focus:border-stone-600 w-72"
              />
            </div>
            <button className="flex items-center gap-2 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-medium text-sm px-4 py-2 rounded-xl transition shadow-lg shadow-rose-950/40">
              <Plus className="h-4 w-4" />
              New Campus
            </button>
          </div>
        </header>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-5">
              <div className="glass-card p-5 rounded-2xl">
                <div className="flex items-center justify-between text-stone-400 mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider">Campuses</span>
                  <Building2 className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="text-3xl font-bold text-white">5</div>
                <div className="text-xs text-emerald-400 font-medium mt-2 flex items-center gap-1">
                  All operational
                </div>
              </div>

              <div className="glass-card p-5 rounded-2xl">
                <div className="flex items-center justify-between text-stone-400 mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider">Total Students</span>
                  <GraduationCap className="h-4 w-4 text-sky-400" />
                </div>
                <div className="text-3xl font-bold text-white">29,750</div>
                <div className="text-xs text-stone-400 mt-2">Across 89 programs</div>
              </div>

              <div className="glass-card p-5 rounded-2xl">
                <div className="flex items-center justify-between text-stone-400 mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider">Active Teachers</span>
                  <Users className="h-4 w-4 text-amber-400" />
                </div>
                <div className="text-3xl font-bold text-white">1,420</div>
                <div className="text-xs text-stone-400 mt-2">Department-scoped</div>
              </div>

              <div className="glass-card p-5 rounded-2xl">
                <div className="flex items-center justify-between text-stone-400 mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider">Soft-Deleted Items</span>
                  <Trash2 className="h-4 w-4 text-rose-400" />
                </div>
                <div className="text-3xl font-bold text-white">3</div>
                <div className="text-xs text-rose-400 font-medium mt-2">Preserved in Recycle Bin</div>
              </div>
            </div>

            {/* Campus List Preview */}
            <div className="glass-card p-6 rounded-2xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-base font-semibold text-white">Christ University Campuses</h3>
                  <p className="text-xs text-stone-400 mt-0.5">Institutional governance across all regional faculties</p>
                </div>
                <button 
                  onClick={() => setActiveTab('campuses')}
                  className="text-xs font-medium text-rose-400 hover:text-rose-300 flex items-center gap-1"
                >
                  Manage All Campuses <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="overflow-hidden rounded-xl border border-stone-800">
                <table className="w-full text-left text-sm text-stone-300">
                  <thead className="bg-stone-900/90 text-xs uppercase tracking-wider text-stone-400 border-b border-stone-800">
                    <tr>
                      <th className="py-3.5 px-4">Campus Name</th>
                      <th className="py-3.5 px-4">Code</th>
                      <th className="py-3.5 px-4">Schools</th>
                      <th className="py-3.5 px-4">Departments</th>
                      <th className="py-3.5 px-4">Enrolled Students</th>
                      <th className="py-3.5 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800/60">
                    {campuses.map(campus => (
                      <tr key={campus.id} className="hover:bg-stone-900/40 transition">
                        <td className="py-3.5 px-4 font-medium text-white">{campus.name}</td>
                        <td className="py-3.5 px-4 text-stone-400 font-mono text-xs">{campus.code}</td>
                        <td className="py-3.5 px-4">{campus.schools}</td>
                        <td className="py-3.5 px-4">{campus.departments}</td>
                        <td className="py-3.5 px-4 font-medium text-white">{campus.students.toLocaleString()}</td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            {campus.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Universal Recycle Bin Tab */}
        {activeTab === 'recycle_bin' && (
          <div className="glass-card p-6 rounded-2xl space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Trash2 className="h-5 w-5 text-rose-400" />
                  Universal Soft-Delete Archive & Restore Center
                </h3>
                <p className="text-xs text-stone-400 mt-1">
                  In accordance with Dr. Alwin Joseph CU's policy: <strong>no data is ever dropped from the database</strong>. 
                  All soft-deleted resources can be restored with a single click.
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-stone-800">
              <table className="w-full text-left text-sm text-stone-300">
                <thead className="bg-stone-900/90 text-xs uppercase tracking-wider text-stone-400 border-b border-stone-800">
                  <tr>
                    <th className="py-3.5 px-4">Entity Type</th>
                    <th className="py-3.5 px-4">Resource Name</th>
                    <th className="py-3.5 px-4">Campus</th>
                    <th className="py-3.5 px-4">Deactivated</th>
                    <th className="py-3.5 px-4">Deactivated By</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/60">
                  {softDeletedItems.map(item => (
                    <tr key={item.id} className="hover:bg-stone-900/40 transition">
                      <td className="py-3.5 px-4">
                        <span className="text-xs px-2.5 py-1 rounded-md bg-stone-800 text-stone-300 border border-stone-700/60">
                          {item.type}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-white">{item.name}</td>
                      <td className="py-3.5 px-4 text-stone-400">{item.campus}</td>
                      <td className="py-3.5 px-4 text-xs text-stone-400">{item.deletedAt}</td>
                      <td className="py-3.5 px-4 text-xs text-stone-300">{item.deletedBy}</td>
                      <td className="py-3.5 px-4 text-right">
                        <button className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition">
                          <RefreshCw className="h-3 w-3" />
                          Restore Resource
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Campuses Tab */}
        {activeTab === 'campuses' && (
          <div className="glass-card p-6 rounded-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-semibold text-white">Multi-Campus Academic Hierarchy</h3>
              <button className="text-xs font-medium bg-stone-800 text-white px-3 py-1.5 rounded-lg hover:bg-stone-700 transition">
                Export Structure (.JSON)
              </button>
            </div>
            <p className="text-xs text-stone-400">
              Hierarchy flow: Campus → School → Department → Program → Batch → Section
            </p>
            <div className="grid grid-cols-2 gap-4 mt-4">
              {campuses.map(campus => (
                <div key={campus.id} className="p-4 rounded-xl bg-stone-900/60 border border-stone-800 hover:border-stone-700 transition">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-white">{campus.name}</h4>
                      <p className="text-xs text-stone-400 mt-0.5">Code: {campus.code}</p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">Active</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-4 text-xs text-stone-300">
                    <div><span className="text-stone-500 block">Schools</span>{campus.schools}</div>
                    <div><span className="text-stone-500 block">Depts</span>{campus.departments}</div>
                    <div><span className="text-stone-500 block">Students</span>{campus.students}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Global Users Tab */}
        {activeTab === 'users' && (
          <div className="glass-card p-6 rounded-2xl space-y-4">
            <h3 className="text-base font-semibold text-white">Cross-Campus User Directory</h3>
            <p className="text-xs text-stone-400">
              Master Admin directory supporting searches by Register No, Employee No, Email, or Campus.
            </p>
            <div className="p-8 text-center text-stone-500 border border-dashed border-stone-800 rounded-xl">
              <Users className="h-8 w-8 mx-auto mb-2 text-stone-600" />
              User management directory active. Full student and teacher records will synchronize via Phase 3.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
