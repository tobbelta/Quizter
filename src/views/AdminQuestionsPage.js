/**
 * Admin-sida för att hantera och visa tillgängliga frågor.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { questionService } from '../services/questionService';
import { QUESTION_BANK } from '../data/questions';
import PaymentSettings from '../components/admin/PaymentSettings';

const AdminQuestionsPage = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [questions, setQuestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedLanguage, setSelectedLanguage] = useState('sv');

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

  // Redirect om användaren inte är admin
  if (!isAdmin) {
    navigate('/');
    return null;
  }

  // Filtrera frågor baserat på sökning och kategori
  const filteredQuestions = questions.filter(question => {
    // Hämta text för valt språk
    const langData = question.languages?.[selectedLanguage] || question.languages?.sv || question.languages?.[Object.keys(question.languages || {})[0]];
    const questionText = langData?.text || question.text || '';
    const questionOptions = langData?.options || question.options || [];

    const matchesSearch = questionText.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         questionOptions.some(option => option.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' ||
                           (question.category && question.category.toLowerCase() === selectedCategory.toLowerCase());
    return matchesSearch && matchesCategory;
  });

  // Få unika kategorier från frågor
  const categories = ['all', ...new Set(questions.map(q => q.category).filter(Boolean))];

  const handleDeleteQuestion = (questionId) => {
    if (!window.confirm('Är du säker på att du vill ta bort denna fråga?')) {
      return;
    }

    try {
      questionService.delete(questionId);
      setQuestions(prev => prev.filter(q => q.id !== questionId));
    } catch (error) {
      console.error('Kunde inte ta bort fråga:', error);
      alert(error.message || 'Kunde inte ta bort frågan. Försök igen.');
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold">Tillgängliga frågor</h1>
            <p className="text-gray-300">Hantera och visa alla frågor i systemet</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/')}
              className="rounded bg-slate-700 px-4 py-2 font-semibold text-gray-200 hover:bg-slate-600"
            >
              Tillbaka till start
            </button>
            <button
              onClick={() => navigate('/admin/create')}
              className="rounded bg-cyan-500 px-4 py-2 font-semibold text-black hover:bg-cyan-400"
            >
              Skapa ny runda
            </button>
          </div>
        </div>

        {/* Sök och filter */}
        <div className="grid gap-4 md:grid-cols-3">
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
          <div>
            <label className="block text-sm font-semibold text-cyan-200 mb-2">Språk</label>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2"
            >
              <option value="sv">Svenska</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        {/* Betalningsinställningar */}
        <PaymentSettings />
      </header>

      {isLoading ? (
        <div className="text-center py-8">
          <p className="text-gray-300">Laddar frågor...</p>
        </div>
      ) : (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-gray-300">
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
              {filteredQuestions.map((question, index) => {
                // Hämta data för valt språk
                const langData = question.languages?.[selectedLanguage] || question.languages?.sv || question.languages?.[Object.keys(question.languages || {})[0]];
                const questionText = langData?.text || question.text || '';
                const questionOptions = langData?.options || question.options || [];
                const questionExplanation = langData?.explanation || question.explanation || '';

                // Visa tillgängliga språk
                const availableLanguages = question.languages ? Object.keys(question.languages) : ['sv'];

                return (
                  <div
                    key={question.id}
                    className="rounded-lg border border-slate-700 bg-slate-900/60 p-6"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-sm font-mono text-gray-400">#{index + 1}</span>
                          {question.category && (
                            <span className="inline-flex items-center rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-xs font-medium text-cyan-200">
                              {question.category}
                            </span>
                          )}
                          <div className="flex gap-1">
                            {availableLanguages.map(lang => (
                              <span
                                key={lang}
                                className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
                                  lang === selectedLanguage
                                    ? 'bg-emerald-500/20 text-emerald-200'
                                    : 'bg-gray-500/20 text-gray-400'
                                }`}
                              >
                                {lang.toUpperCase()}
                              </span>
                            ))}
                          </div>
                        </div>
                        <h3 className="text-lg font-semibold mb-3">{questionText}</h3>
                      </div>
                    {QUESTION_BANK.some(q => q.id === question.id) ? (
                      <span className="rounded bg-gray-600 px-3 py-1 text-sm font-semibold text-gray-300 cursor-not-allowed">
                        Inbyggd fråga
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

                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-gray-300 mb-2">Svarsalternativ ({selectedLanguage.toUpperCase()}):</p>
                      {questionOptions.map((option, optionIndex) => (
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

                    {questionExplanation && (
                      <div className="mt-4 p-3 bg-slate-800/40 rounded border border-slate-600">
                        <p className="text-sm font-semibold text-gray-300 mb-1">Förklaring ({selectedLanguage.toUpperCase()}):</p>
                        <p className="text-sm text-gray-300">{questionExplanation}</p>
                      </div>
                    )}

                    <div className="mt-4 pt-3 border-t border-slate-700 text-sm text-gray-400">
                      <p>ID: {question.id}</p>
                      {question.source && (
                        <p>Källa: {question.source}</p>
                      )}
                      {question.createdBy && (
                        <p>Skapad av: {question.createdBy}</p>
                      )}
                      <p>Tillgängliga språk: {availableLanguages.join(', ').toUpperCase()}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminQuestionsPage;