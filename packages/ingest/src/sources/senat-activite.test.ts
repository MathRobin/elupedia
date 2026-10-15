// Tests de senat-activite : parsing d'une ligne COPY de tam_questions /
// tam_reponses (colonnes tabulées, \N = NULL). Le téléchargement du dump
// n'est pas testé.
import { describe, it, expect } from 'vitest';
import { parseQuestionRow, parseReponseRow } from './senat-activite.js';

describe('parseQuestionRow', () => {
  const sampleLine = [
    '92', // id
    '10', // sorquecod
    '58502E', // matricule
    'QE', // natquecod
    '6', // legislature
    '100', // etaquecod
    'uuid-123', // uuid
    '02185', // numero
    'SEQ780402185', // reference
    'Situation du marché', // titre
    '1', // version
    '1978-05-27 00:00:00', // datecloture
    '29', // delaijours
    'Dupont', // nom
    'Marie', // prenom
    'DUPONT MARIE', // nomtechnique
    'Mme', // codequalite
    '590', // cirnum
    'Nord', // circonscription
    'SOC', // groupe
    'Économie', // rubrique
    '2024-03-15 00:00:00', // datejodepot
    '173', // mindepotid
    'Industrie', // mindepotlib
    '\\N', // datejotran
    '\\N', // mintranid
    '\\N', // mintranlib
    'Industrie', // minreplib1
    '173', // minrepid1
    '29', // delaijoursrep1
    '2024-04-15 00:00:00', // datejorep1
    '\\N', // datesynctam
    '5', // natqueord
    '5', // repub
    '\\N', // uuidtransori
    '\\N', // dattransori
    '\\N', // uuidtrans
    '\\N', // dattrans
    '\\N', // uuidquerappelee
    '\\N', // refquerappelee
    '\\N', // daterappel
    'Ma question au gouvernement', // txtque
  ].join('\t');

  it('parses a valid question line', () => {
    const question = parseQuestionRow(sampleLine);
    expect(question).not.toBeNull();
    expect(question!.id).toBe(92);
    expect(question!.matricule).toBe('58502E');
    expect(question!.nature).toBe('QE');
    expect(question!.titre).toBe('Situation du marché');
    expect(question!.rubrique).toBe('Économie');
    expect(question!.questionText).toBe('Ma question au gouvernement');
    expect(question!.mindepotlib).toBe('Industrie');
    expect(question!.sourceRef).toBe('SEQ780402185');
    expect(question!.questionNumber).toBe(2185);
  });

  it('handles \\N values as empty', () => {
    const line = sampleLine.replace('Ma question au gouvernement', '\\N');
    const question = parseQuestionRow(line);
    expect(question!.questionText).toBe('');
  });

  it('returns null for invalid id', () => {
    const line = 'abc\t10\t58502E\tQE\t6';
    expect(parseQuestionRow(line)).toBeNull();
  });
});

describe('parseReponseRow', () => {
  const sampleLine = [
    '180154', // idque
    '2024-05-14 00:00:00', // datejorep
    'Voici la réponse du gouvernement', // txtrep
    '66', // delaijoursrep
    '351', // minrepid
    'Intérieur', // minreplib
    '1016', // pagejorep
    '\\N', // urlrep
    '\\N', // errpage
    '\\N', // errdate
    'uuid-rep-123', // idrepunique
    '\\N', // txterrrep
  ].join('\t');

  it('parses a valid response line', () => {
    const reponse = parseReponseRow(sampleLine);
    expect(reponse).not.toBeNull();
    expect(reponse!.idque).toBe(180154);
    expect(reponse!.datejorep).toBe('2024-05-14 00:00:00');
    expect(reponse!.txtrep).toBe('Voici la réponse du gouvernement');
    expect(reponse!.minreplib).toBe('Intérieur');
  });

  it('handles \\N values as empty', () => {
    const line = sampleLine.replace('Voici la réponse du gouvernement', '\\N');
    const reponse = parseReponseRow(line);
    expect(reponse!.txtrep).toBe('');
  });

  it('returns null for invalid idque', () => {
    const line = 'abc\t2024-01-01\ttext';
    expect(parseReponseRow(line)).toBeNull();
  });
});
