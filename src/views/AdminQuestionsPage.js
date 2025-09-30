/**
 * Admin-sida för att hantera och visa tillgängliga frågor.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { questionService } from '../services/questionService';
import { QUESTION_BANK } from '../data/questions';
import Header from '../components/layout/Header';
import Pagination from '../components/shared/Pagination';
import { questionRepository } from '../repositories/questionRepository';

const QuestionCard = ({ question, index, expandedQuestion, setExpandedQuestion, handleDeleteQuestion, isSelected, onSelect }) => {
  const [currentLang, setCurrentLang] = useState('sv');

  // Hämta data för valt språk
  const svLang = question.languages?.sv || { text: question.text, options: question.options, explanation: question.explanation };
  const enLang = question.languages?.en;

  const isExpanded = expandedQuestion === question.id;

  const displayLang = currentLang === 'sv' ? svLang : enLang;
  const hasBothLanguages = svLang && enLang;
  const isBuiltIn = QUESTION_BANK.some(q => q.id === question.id);

  return (
    <div className={`rounded-lg border bg-slate-900/60 p-4 transition-colors ${isSelected ? 'border-cyan-500' : 'border-slate-700'}`}>
      <div className="flex items-start gap-4">
        {!isBuiltIn && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onSelect(question.id)}
            className="mt-1 h-5 w-5 rounded border-gray-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
          />
        )}
        <div className={`flex-1 ${isBuiltIn ? 'ml-9' : ''}`}>
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm font-mono text-gray-400">#{index + 1}</span>
                {question.category && (
                  <span className="inline-flex items-center rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-xs font-medium text-cyan-200">
                    {question.category}
                  </span>
                )}
                {hasBothLanguages && (
                  <div className="flex items-center rounded-full bg-slate-800 p-0.5">
                    <button onClick={() => setCurrentLang('sv')} className={`px-2 py-0.5 text-xs rounded-full ${currentLang === 'sv' ? 'bg-cyan-500 text-black' : 'text-gray-300'}`}>SV</button>
                    <button onClick={() => setCurrentLang('en')} className={`px-2 py-0.5 text-xs rounded-full ${currentLang === 'en' ? 'bg-cyan-500 text-black' : 'text-gray-300'}`}>EN</button>
                  </div>
                )}
              </div>
              <button
                onClick={() => setExpandedQuestion(isExpanded ? null : question.id)}
                className="text-lg font-semibold text-left hover:text-cyan-300 transition-colors"
              >
                {displayLang?.text || (currentLang === 'en' ? '(No English text)' : '(Ingen svensk text)')}
              </button>
            </div>
            {isBuiltIn ? (
              <span className="rounded bg-gray-600 px-3 py-1 text-sm font-semibold text-gray-300 cursor-not-allowed">
                Inbyggd
              </span>
            ) : (
              <button
                onClick={() => handleDeleteQuestion(question.id)}
                className="rounded bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-500"
              >
                Ta bort
              </button>
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-slate-700 space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-300 mb-2">Svarsalternativ ({currentLang.toUpperCase()}):</p>
            {(displayLang?.options || []).map((option, optionIndex) => (
              <div
                key={optionIndex}
                className={`flex items-center gap-3 rounded border px-3 py-2 ${
                  optionIndex === question.correctOption
                    ? 'border-emerald-500 bg-emerald-500/20 text-emerald-100'
                    : 'border-slate-600 bg-slate-800/40 text-gray-300'
                }`}
              >
                <span className="text-sm font-mono">
                  {String.fromCharCode(65 + optionIndex)}:
                </span>
                <span>{option}</span>
                {optionIndex === question.correctOption && (
                  <span className="ml-auto text-xs font-semibold text-emerald-200">
                    RÄTT SVAR
                  </span>
                )}
              </div>
            ))}
          </div>

          {displayLang?.explanation && (
            <div className="p-3 bg-slate-800/40 rounded border border-slate-600">
              <p className="text-sm font-semibold text-gray-300 mb-1">Förklaring ({currentLang.toUpperCase()}):</p>
              <p className="text-sm text-gray-300">{displayLang.explanation}</p>
            </div>
          )}

          <div className="text-sm text-gray-400">
            <p>ID: {question.id}</p>
            {question.source && <p>Källa: {question.source}</p>}
            {question.createdBy && <p>Skapad av: {question.createdBy}</p>}
          </div>
        </div>
      )}
    </div>
  );
};

const AdminQuestionsPage = () => {
  const navigate = useNavigate();
  const { isSuperUser } = useAuth();
  const [questions, setQuestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [expandedQuestion, setExpandedQuestion] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedQuestions, setSelectedQuestions] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const loadQuestions = () => {
      try {
        setIsLoading(true);
        const allQuestions = questionService.listAll();
        setQuestions(allQuestions || []);
      } catch (error) {
        console.error('Kunde inte ladda frågor:', error);
        setQuestions([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadQuestions();
  }, []);

  // Redirect om användaren inte är SuperUser
  useEffect(() => {
    if (!isSuperUser) {
      navigate('/');
    }
  }, [isSuperUser, navigate]);

  // Filtrera frågor baserat på sökning och kategori
  const filteredQuestions = questions.filter(question => {
    // Hämta text för valt språk
    const svText = question.languages?.sv?.text || question.text || '';
    const enText = question.languages?.en?.text || '';
    const svOptions = question.languages?.sv?.options || question.options || [];
    const enOptions = question.languages?.en?.options || [];

    const matchesSearch = svText.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         enText.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         svOptions.some(o => o.toLowerCase().includes(searchTerm.toLowerCase())) ||
                         enOptions.some(o => o.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' ||
                           (question.category && question.category.toLowerCase() === selectedCategory.toLowerCase());
    return matchesSearch && matchesCategory;
  });

  // Få unika kategorier från frågor
  const categories = ['all', ...new Set(questions.map(q => q.category).filter(Boolean))];

  // Paginering
  const paginatedQuestions = filteredQuestions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  /** Hämtar fler frågor från OpenTDB. */
  const handleImportQuestions = async () => {
    setIsImporting(true);
    try {
      const newQuestions = await questionService.fetchAndAddFromOpenTDB({
        amount: 10,
        difficulty: 'medium',
        audience: 'adult'
      });
      // Ladda om frågorna efter import
      setQuestions(questionService.listAll() || []);

      if (newQuestions && newQuestions.length > 0) {
        alert(`${newQuestions.length} nya frågor importerades och översattes!`);
      } else {
        alert('Inga nya frågor kunde importeras. Detta kan bero på att översättningen misslyckades eller att inga passande frågor hittades.');
      }
    } catch (error) {
      alert(`Kunde inte importera frågor: ${error.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    if (!window.confirm('Är du säker på att du vill ta bort denna fråga?')) {
      return;
    }

    try {
      await questionService.delete(questionId);
      setQuestions(prev => prev.filter(q => q.id !== questionId));
    } catch (error) {
      console.error('Kunde inte ta bort fråga:', error);
      alert(error.message || 'Kunde inte ta bort frågan. Försök igen.');
    }
  };

  const handleToggleSelect = (questionId) => {
    setSelectedQuestions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(questionId)) {
        newSet.delete(questionId);
      } else {
        newSet.add(questionId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedQuestions.size === deletableQuestions.length) {
      setSelectedQuestions(new Set());
    } else {
      setSelectedQuestions(new Set(deletableQuestions.map(q => q.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedQuestions.size === 0) return;

    if (!window.confirm(`Är du säker på att du vill radera ${selectedQuestions.size} fråga(r)?`)) {
      return;
    }

    try {
      // Anropa repository direkt för massradering
      await questionRepository.deleteQuestions(Array.from(selectedQuestions));

      setQuestions(prev => prev.filter(q => !selectedQuestions.has(q.id)));
      setSelectedQuestions(new Set());
    } catch (error) {
      console.error('Kunde inte radera markerade frågor:', error);
      alert('Ett fel uppstod vid radering. Vissa frågor kan vara kvar.');
    }
  };

  const deletableQuestions = filteredQuestions.filter(
    q => !QUESTION_BANK.some(bq => bq.id === q.id)
  );
  const isAllSelected = selectedQuestions.size > 0 && selectedQuestions.size === deletableQuestions.length;

  if (!isSuperUser) {
    return null; // Visa inget medan omdirigering sker
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Header title="Frågebank" />

      <div className="mx-auto max-w-6xl px-4 pt-24 pb-8">
        {/* Sök och filter */}
        <div className="mb-6 flex flex-col md:flex-row gap-4 items-end justify-between">
          <div>
            <label className="block text-sm font-semibold text-cyan-200 mb-2">Sök frågor</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
              placeholder="Sök i frågetext och svarsalternativ..."
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-cyan-200 mb-2">Kategori</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
            >
              {categories.map(category => (
                <option key={category} value={category}>
                  {category === 'all' ? 'Alla kategorier' : category}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={handleImportQuestions}
              disabled={isImporting}
              className="rounded bg-purple-500 px-4 py-2 font-semibold text-black hover:bg-purple-400 disabled:bg-slate-700 disabled:text-gray-400"
            >
              {isImporting ? 'Importerar...' : 'Importera 10 frågor'}
            </button>
          </div>
        </div>

        {/* Masshantering */}
        <div className="mb-4 flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg p-2">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={handleSelectAll}
              disabled={deletableQuestions.length === 0}
              className="h-5 w-5 rounded border-gray-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500 disabled:opacity-50"
            />
            <label className="text-sm text-gray-300">
              {selectedQuestions.size > 0 ? `${selectedQuestions.size} valda` : 'Markera alla'}
            </label>
          </div>
          <div>
            <button onClick={handleDeleteSelected} disabled={selectedQuestions.size === 0} className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:bg-slate-700 disabled:cursor-not-allowed">
              Radera markerade
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-8">
            <p className="text-gray-300">Laddar frågor...</p>
          </div>
        ) : (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-gray-400">
                Visar {filteredQuestions.length} av {questions.length} frågor
              </p>
            </div>

            {filteredQuestions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-300">
                  {searchTerm || selectedCategory !== 'all'
                    ? 'Inga frågor matchade dina filter.'
                    : 'Inga frågor hittades i systemet.'
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {paginatedQuestions.map((question, index) => {
                  const absoluteIndex = (currentPage - 1) * itemsPerPage + index;
                  return (
                    <QuestionCard
                      key={`${question.id}-${index}`}
                      question={question}
                      index={absoluteIndex}
                      expandedQuestion={expandedQuestion}
                      setExpandedQuestion={setExpandedQuestion}
                      handleDeleteQuestion={handleDeleteQuestion}
                      isSelected={selectedQuestions.has(question.id)}
                      onSelect={handleToggleSelect}
                    />
                  );
                })}

                <Pagination
                  currentPage={currentPage}
                  totalItems={filteredQuestions.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={handlePageChange}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminQuestionsPage;