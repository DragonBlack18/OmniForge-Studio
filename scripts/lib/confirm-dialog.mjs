/** Respond through the same accessible modal controls used by a person. */
export async function answerConfirmation(page, accepted, {title} = {}) {
  if (typeof accepted !== 'boolean') throw new TypeError('Resposta de confirmação deve ser booleana.');
  const dialog = page.getByTestId('workbench-confirm-dialog');
  await dialog.waitFor({state:'visible'});
  if (title) await dialog.getByRole('heading', {name:title,exact:true}).waitFor();
  const button = accepted
    ? dialog.getByTestId('workbench-confirm-accept')
    : dialog.getByRole('button', {name:'Cancelar',exact:true});
  await button.click();
  await dialog.waitFor({state:'hidden'});
}
