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

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface QuizTemplate {
  id: number;
  title: string;
  description: string;
  is_draft: boolean;
  question_count: number;
  created_at: string;
}

export const QuizLibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<QuizTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const fetchQuizzes = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/quizzes/`);
      if (res.ok) {
        const data = await res.json();
        setQuizzes(data);
      }
    } catch (err) {
      console.error("Failed to fetch quizzes", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this quiz?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/quizzes/${id}`, { method: "DELETE" });
      if (res.ok) {
        setQuizzes(prev => prev.filter(q => q.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePlay = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/quizzes/${id}/session`, { method: "POST" });
      if (res.ok) {
        const session = await res.json();
        navigate(`/games/quiz/host/${session.pin}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredQuizzes = quizzes.filter(q => 
    q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (q.description && q.description.toLowerCase().includes(searchQuery.toLowerCase()))
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

      {/* Toolbar */}
      <GlassCard className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Search your quizzes..."
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
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-all border border-gray-200">
            <Filter size={16} /> Filter
          </button>
        </div>
      </GlassCard>

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
                    <button 
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
                      onClick={() => handleDelete(quiz.id)}
                      className="p-3 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
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
                   <button onClick={() => navigate(`/games/quiz/edit/${quiz.id}`)} className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"><Edit3 size={20}/></button>
                   {!quiz.is_draft && (
                     <button onClick={() => handlePlay(quiz.id)} className="px-4 py-2 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition-all flex items-center gap-2"><Play size={14} fill="white"/> Host</button>
                   )}
                   <button onClick={() => handleDelete(quiz.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={20}/></button>
                </div>
             </GlassCard>
           ))}
        </div>
      )}
    </div>
  );
};
