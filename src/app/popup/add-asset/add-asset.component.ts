import { Component, OnInit, OnDestroy } from '@angular/core';
import { Asset } from '@/models/models';
import { AssetState, ChromeService, GlobalService } from '@/app/core';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
@Component({
  templateUrl: 'add-asset.component.html',
  styleUrls: ['add-asset.component.scss'],
})
export class PopupAddAssetComponent implements OnInit, OnDestroy {
  public searchAsset: Asset; // Searched asset
  public watch: Asset[] = []; // User-added assets
  public moneyBalance: Asset[] = [];
  public isLoading = false;
  public searchValue: string = '';

  sourceScrollHeight = 0;

  private accountSub: Unsubscribable;
  networkId: number;
  private address: string;
  constructor(
    private asset: AssetState,
    private chrome: ChromeService,
    private global: GlobalService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      const chain = state.currentChainType;
      const network =
        chain === 'Neo2'
          ? state.n2Networks[state.n2NetworkIndex]
          : state.n3Networks[state.n3NetworkIndex];
      this.networkId = network.id;
      this.address = state.currentWallet.accounts[0].address;
      this.asset
        .getAddressBalances(this.address)
        .then((res) => (this.moneyBalance = res));
      this.chrome
        .getWatch(this.networkId, this.address)
        .subscribe((res) => (this.watch = res));
    });
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  public addAsset() {
    this.searchAsset.watching = true;
    const index = this.watch.findIndex(
      (w) => w.asset_id === this.searchAsset.asset_id
    );
    if (index >= 0) {
      this.watch[index].watching = true;
    } else {
      this.watch.push(this.searchAsset);
    }
    this.chrome.setWatch(this.networkId, this.address, this.watch);
    this.global.snackBarTip('addSucc');
  }

  public searchCurrency() {
    if (!this.searchValue) {
      return;
    }
    this.isLoading = true;
    this.searchAsset = undefined;
    this.asset
      .searchAsset(this.searchValue)
      .then((res) => {
        this.searchAsset = res;
        const moneyIndex = this.moneyBalance.findIndex(
          (w) =>
            w.asset_id.includes(res.asset_id) ||
            res.asset_id.includes(w.asset_id)
        );
        const index = this.watch.findIndex((w) => w.asset_id === res.asset_id);
        if (index >= 0) {
          this.searchAsset.watching = this.watch[index].watching;
        } else {
          this.searchAsset.watching = moneyIndex >= 0 ? true : false;
        }
        this.isLoading = false;
      })
      .catch(() => {
        this.isLoading = false;
      });
  }
}
