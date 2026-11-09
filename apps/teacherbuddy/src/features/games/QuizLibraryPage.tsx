import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Filter,
  MoreVertical,
  Play,
  Edit3,
  Trash2,
  Calendar,
  Gamepad2,
  CheckCircle2,
  Clock,
  LayoutGrid,
  List as ListIcon
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "../../shared/components/GlassCard";
import { TeacherTestRuns } from "./TeacherTestRuns";



import { apiCall } from "../../shared/utils/apiCall";

type QuizFilter = "all" | "live" | "draft" | "public" | "private";
interface QuizTemplate {
  id: number;
  title: string;
  description: string;
  is_draft: boolean;
  is_public: boolean;
  question_count: number;
  created_at: string;
}

export const QuizLibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<QuizTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [tab, setTab] = useState<"mine" | "library">("mine");
  const [filter, setFilter] = useState<QuizFilter>("all");
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    fetchQuizzes();
  }, [tab]);

  const fetchQuizzes = async () => {
    const r = await apiCall<QuizTemplate[]>("GET", `/quizzes/${tab === "library" ? "?scope=library" : ""}`);
    if (r.ok && Array.isArray(r.data)) setQuizzes(r.data);
    else setError(r.error || "Could not load the quizzes.");
    setLoading(false);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this quiz?")) return;
    setError("");
    const r = await apiCall("DELETE", `/quizzes/${id}`);
    if (r.ok) setQuizzes(prev => prev.filter(q => q.id !== id));
    else setError(r.error || "The quiz could not be deleted.");
  };

  const startSession = async (id: number, testRun: boolean) => {
    setError("");
    const r = await apiCall<{ pin: string }>("POST", `/quizzes/${id}/session`, testRun ? { is_test_run: true } : undefined);
    if (r.ok && r.data?.pin) navigate(`/games/quiz/session/${r.data.pin}`);
    else setError(r.error || "The game could not be started.");
  };
  const handlePlay = (id: number) => startSession(id, false);
  const handleStartTestRun = (id: number) => startSession(id, true);

  const handleTogglePublic = async (quiz: QuizTemplate) => {
    setError("");
    const r = await apiCall("PUT", `/quizzes/${quiz.id}`, { is_public: !quiz.is_public });
    if (r.ok) setQuizzes(prev => prev.map(q => (q.id === quiz.id ? { ...q, is_public: !quiz.is_public } : q)));
    else setError(r.error || "The quiz visibility could not be changed.");
  };

  const handleClone = async (id: number) => {
    setError("");
    const r = await apiCall<{ id: number }>("POST", `/quizzes/${id}/clone`);
    if (r.ok && r.data?.id) navigate(`/games/quiz/edit/${r.data.id}`);
    else setError(r.error || "The quiz could not be copied.");
  };

  const matchesFilter = (q: QuizTemplate) =>
    filter === "all" ||
    (filter === "live" && !q.is_draft) ||
    (filter === "draft" && q.is_draft) ||
    (filter === "public" && q.is_public) ||
    (filter === "private" && !q.is_public);

  const filteredQuizzes = quizzes.filter(q =>
    matchesFilter(q) && (
      (q.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (q.description && q.description.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  );

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black font-display tracking-tight text-gray-900 flex items-center gap-3">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-200">
              <Gamepad2 size={28} />
            </div>
            Quiz Battle Royale
          </h1>
          <p className="text-gray-500 mt-1 font-medium">Manage your quiz templates, drafts, and start live battles.</p>
        </div>

        <button
          onClick={() => navigate('/games/quiz/create')}
          className="flex items-center justify-center gap-2 px-8 py-4 bg-blue-600 text-white font-black rounded-2xl shadow-xl shadow-blue-200 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <Plus size={20} strokeWidth={3} />
          CREATE NEW QUIZ
        </button>
      </div>

      <TeacherTestRuns />

      <div className="flex gap-2">
        {(["mine", "library"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-xl text-sm font-black transition-all ${tab === t ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"}`}
          >
            {t === "mine" ? "My quizzes" : "Public library"}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <GlassCard className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder={tab === "library" ? "Search the public library..." : "Search your quizzes..."}
            className="w-full pl-12 pr-4 py-3 bg-gray-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 p-1 rounded-lg mr-4">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'}`}
            >
              <LayoutGrid size={18} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'}`}
            >
              <ListIcon size={18} />
            </button>
          </div>
          <label className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-gray-600 rounded-xl border border-gray-200">
            <Filter size={16} />
            <select
              aria-label="Filter quizzes"
              value={filter}
              onChange={e => setFilter(e.target.value as QuizFilter)}
              className="bg-transparent outline-none font-bold cursor-pointer"
            >
              <option value="all">All quizzes</option>
              <option value="live">Live</option>
              <option value="draft">Drafts</option>
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </label>
        </div>
      </GlassCard>

      {error && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="font-bold hover:underline">Dismiss</button>
        </div>
      )}

      {/* Content Area */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-64 bg-gray-100 animate-pulse rounded-3xl" />
          ))}
        </div>
      ) : filteredQuizzes.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-3xl border-2 border-dashed border-gray-100">
          <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Search size={32} className="text-gray-300" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">No quizzes found</h3>
          <p className="text-gray-500 mt-2">Try adjusting your search or create a new quiz.</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <AnimatePresence>
            {filteredQuizzes.map((quiz) => (
              <motion.div
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                key={quiz.id}
                className="group"
              >
                <GlassCard className="h-full flex flex-col overflow-hidden hover:shadow-2xl hover:shadow-blue-500/5 transition-all border border-transparent hover:border-blue-100">
                  <div className="p-8 flex-1">
                    <div className="flex items-center justify-between mb-6">
                      <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        quiz.is_draft ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'
                      }`}>
                        {quiz.is_draft ? 'Draft' : 'Live'}
                      </div>
                      {tab === "mine" && (
                        <button
                          onClick={() => handleTogglePublic(quiz)}
                          title="Public quizzes appear in every teacher's library as a reference"
                          className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${quiz.is_public ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}
                        >
                          {quiz.is_public ? 'Public' : 'Private'}
                        </button>
                      )}
                      <div className="text-gray-300 group-hover:text-blue-500 transition-colors">
                        <MoreVertical size={20} />
                      </div>
                    </div>

                    <h3 className="text-2xl font-black text-gray-900 mb-3 group-hover:text-blue-600 transition-colors">
                      {quiz.title}
                    </h3>
                    <p className="text-gray-500 text-sm line-clamp-2 mb-6 font-medium leading-relaxed">
                      {quiz.description || "No description provided for this quiz template."}
                    </p>

                    <div className="flex items-center gap-6 mt-auto">
                      <div className="flex items-center gap-2 text-gray-400 font-bold text-xs uppercase tracking-wider">
                        <CheckCircle2 size={16} className="text-blue-500" />
                        {quiz.question_count} Questions
                      </div>
                      <div className="flex items-center gap-2 text-gray-400 font-bold text-xs uppercase tracking-wider">
                        <Clock size={16} />
                        {new Date(quiz.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex items-center gap-2">
                    {tab === "library" ? (
                      <button
                        onClick={() => handleClone(quiz.id)}
                        className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                      >
                        Use a copy
                      </button>
                    ) : (<>
                    <button
                      aria-label={`Edit ${quiz.title}`}
                      title="Edit"
                      onClick={() => navigate(`/games/quiz/edit/${quiz.id}`)}
                      className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl text-sm hover:bg-gray-50 transition-all flex items-center justify-center gap-2 shadow-sm"
                    >
                      <Edit3 size={16} /> Edit
                    </button>
                    {!quiz.is_draft && (
                      <button
                        onClick={() => handlePlay(quiz.id)}
                        className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl text-sm hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
                      >
                        <Play size={16} fill="white" /> Host
                      </button>
                    )}
                    <button
                      onClick={() => handleStartTestRun(quiz.id)}
                      className="flex-1 py-3 bg-amber-500 text-white font-bold rounded-xl text-sm hover:bg-amber-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-200"
                    >
                      Test run
                    </button>
                    <button
                      aria-label={`Delete ${quiz.title}`}
                      title="Delete"
                      onClick={() => handleDelete(quiz.id)}
                      className="p-3 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                    </>)}
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="space-y-4">
           {filteredQuizzes.map(quiz => (
             <GlassCard key={quiz.id} className="p-4 flex items-center justify-between hover:border-blue-100 transition-all group">
                <div className="flex items-center gap-6">
                   <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${quiz.is_draft ? 'bg-amber-50 text-amber-500' : 'bg-blue-50 text-blue-500'}`}>
                      <Gamepad2 size={24} />
                   </div>
                   <div>
                      <h4 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                        {quiz.title}
                        {quiz.is_draft && <span className="text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-md uppercase font-black">Draft</span>}
                      </h4>
                      <p className="text-sm text-gray-500 font-medium">{quiz.question_count} Questions • Created on {new Date(quiz.created_at).toLocaleDateString()}</p>
                   </div>
                </div>
                <div className="flex items-center gap-3">
                   {tab === "library" ? (
                     <button onClick={() => handleClone(quiz.id)} className="px-4 py-2 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition-all">Use a copy</button>
                   ) : (<>
                   <button aria-label={`Edit ${quiz.title}`} title="Edit" onClick={() => navigate(`/games/quiz/edit/${quiz.id}`)} className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"><Edit3 size={20}/></button>
                   {!quiz.is_draft && (
                     <button onClick={() => handlePlay(quiz.id)} className="px-4 py-2 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition-all flex items-center gap-2"><Play size={14} fill="white"/> Host</button>
                   )}
                   <button onClick={() => handleStartTestRun(quiz.id)} className="px-4 py-2 bg-amber-500 text-white font-bold text-sm rounded-xl hover:bg-amber-600 transition-all">Test run</button>
                   <button aria-label={`Delete ${quiz.title}`} title="Delete" onClick={() => handleDelete(quiz.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={20}/></button>
                   </>)}
                </div>
             </GlassCard>
           ))}
        </div>
      )}
    </div>
  );
};
